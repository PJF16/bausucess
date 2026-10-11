// Einmaliger, idempotenter Backfill: schreibt den Betrags-Snapshot für
// Rechnungen, die vor Einführung der Snapshot-Felder gelegt wurden
// (netto IS NULL). Eine frische Installation hat keine solchen Rechnungen –
// dann ist dies ein No-op. Wird vom Deployment-Seed und lokal mit
// `npx tsx prisma/backfill-rechnungen.ts` aufgerufen.

import { PrismaClient } from "@prisma/client";
import { nettoAusBloecken, rechnungsSummen } from "../src/lib/rechnung";
import { runde2 } from "../src/lib/kalk";

const prisma = new PrismaClient();

export async function backfillRechnungen(client: PrismaClient = prisma) {
  const offen = await client.rechnung.findMany({
    where: { status: { not: "ENTWURF" }, netto: null },
    orderBy: [{ lvId: "asc" }, { nummer: "asc" }],
    include: { lv: true, zeilen: { include: { position: true } } },
  });
  if (offen.length === 0) return 0;

  let anzahl = 0;
  for (const r of offen) {
    const mengeJePosition = new Map<string, { menge: number; ep: number }>();
    for (const z of r.zeilen) {
      const ep = runde2(
        Number(z.position.epLohn) + Number(z.position.epSonstiges)
      );
      const vorhanden = mengeJePosition.get(z.positionId);
      mengeJePosition.set(z.positionId, {
        menge: (vorhanden?.menge ?? 0) + Number(z.menge),
        ep,
      });
    }
    // Schlussrechnung: kumulativ über alle abgerechneten Zeilen des LV
    let bloecke = Array.from(mengeJePosition.values());
    let bereitsVerrechnet = 0;
    if (r.art === "SCHLUSSRECHNUNG") {
      const alle = await client.aufmasszeile.findMany({
        where: { blatt: { lvId: r.lvId }, rechnungId: { not: null } },
        include: { position: true },
      });
      const map = new Map<string, { menge: number; ep: number }>();
      for (const z of alle) {
        const ep = runde2(
          Number(z.position.epLohn) + Number(z.position.epSonstiges)
        );
        const v = map.get(z.positionId);
        map.set(z.positionId, { menge: (v?.menge ?? 0) + Number(z.menge), ep });
      }
      bloecke = Array.from(map.values());
      // Teilrechnungen werden vor der Schlussrechnung verarbeitet (nummer-
      // Reihenfolge); ihr Zahlbetrag steht daher bereits in der DB.
      const trs = await client.rechnung.findMany({
        where: { lvId: r.lvId, art: "TEILRECHNUNG" },
        select: { zahlbetrag: true },
      });
      bereitsVerrechnet = runde2(
        trs.reduce((acc, t) => acc + Number(t.zahlbetrag ?? 0), 0)
      );
    }

    const netto = nettoAusBloecken(bloecke);
    const ruecklassSatz =
      r.art === "TEILRECHNUNG"
        ? Number(r.lv.deckungsruecklass)
        : Number(r.lv.haftruecklass);
    const summen = rechnungsSummen(
      netto,
      {
        ruecklassSatz,
        ustSatz: Number(r.lv.ustSatz),
        skontoSatz: Number(r.lv.skonto),
        skontoTage: r.lv.skontoTage,
      },
      bereitsVerrechnet
    );

    await client.$transaction(async (tx) => {
      await tx.rechnung.update({
        where: { id: r.id },
        data: {
          gelegtAm: r.datum,
          netto: summen.netto,
          ruecklassSatz,
          ustSatz: r.lv.ustSatz,
          skontoSatz: r.lv.skonto,
          skontoTage: r.lv.skontoTage,
          bereitsVerrechnet: summen.bereitsVerrechnet,
          zahlbetrag: summen.zahlbetrag,
        },
      });
      const eps = new Map<string, number>();
      for (const [positionId, { ep }] of mengeJePosition) eps.set(positionId, ep);
      for (const [positionId, ep] of eps) {
        await tx.rechnungsPosition.upsert({
          where: { rechnungId_positionId: { rechnungId: r.id, positionId } },
          update: { ep },
          create: { rechnungId: r.id, positionId, ep },
        });
      }
    });

    anzahl++;
  }
  return anzahl;
}

// Direkter Aufruf via `npx tsx prisma/backfill-rechnungen.ts`
if (process.argv[1] && process.argv[1].includes("backfill-rechnungen")) {
  backfillRechnungen()
    .then((n) => {
      console.log(`Backfill abgeschlossen: ${n} Rechnung(en) aktualisiert.`);
    })
    .finally(() => prisma.$disconnect());
}
