"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import { ansatzAuswerten } from "@/lib/aufmass";
import { nettoAusBloecken, rechnungsSummen } from "@/lib/rechnung";
import { runde2 } from "@/lib/kalk";
import type { RechnungArt, RechnungStatus } from "@prisma/client";

async function lvDesMandanten(lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    select: { id: true, projektId: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");
  return lv;
}

function abrechnungPfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}/abrechnung`;
}

// ── Aufmaßblätter ────────────────────────────────────────────────────

export async function blattAnlegen(lvId: string, bezeichnung: string) {
  const lv = await lvDesMandanten(lvId);
  if (!bezeichnung.trim()) return;
  const max = await prisma.aufmassblatt.aggregate({
    where: { lvId },
    _max: { nummer: true },
  });
  await prisma.aufmassblatt.create({
    data: {
      lvId,
      nummer: (max._max.nummer ?? 0) + 1,
      bezeichnung: bezeichnung.trim(),
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function blattLoeschen(lvId: string, blattId: string) {
  const lv = await lvDesMandanten(lvId);
  const abgerechnet = await prisma.aufmasszeile.count({
    where: { blattId, blatt: { lvId }, rechnungId: { not: null } },
  });
  if (abgerechnet > 0) {
    throw new Error(
      "Blatt enthält bereits abgerechnete Zeilen und kann nicht gelöscht werden"
    );
  }
  await prisma.aufmassblatt.deleteMany({ where: { id: blattId, lvId } });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

// ── Aufmaßzeilen ─────────────────────────────────────────────────────

export interface AufmasszeileDaten {
  bezeichnung: string;
  ansatz: string;
  menge: number;
}

/** Menge aus dem Ansatz berechnen; ungültige Ansätze werden abgelehnt. */
function effektiveMenge(daten: AufmasszeileDaten): number {
  if (daten.ansatz.trim()) {
    const berechnet = ansatzAuswerten(daten.ansatz);
    if (berechnet === null) {
      throw new Error("Der Ansatz kann nicht ausgewertet werden");
    }
    return berechnet;
  }
  if (!Number.isFinite(daten.menge)) {
    throw new Error("Ungültige Menge");
  }
  return daten.menge;
}

export async function zeileAnlegen(
  lvId: string,
  blattId: string,
  positionId: string,
  daten: AufmasszeileDaten
) {
  const lv = await lvDesMandanten(lvId);
  const blatt = await prisma.aufmassblatt.findFirst({
    where: { id: blattId, lvId },
  });
  const position = await prisma.position.findFirst({
    where: { id: positionId, lvId },
  });
  if (!blatt || !position) throw new Error("Blatt oder Position nicht gefunden");

  const max = await prisma.aufmasszeile.aggregate({
    where: { blattId },
    _max: { sortier: true },
  });
  await prisma.aufmasszeile.create({
    data: {
      blattId,
      positionId,
      bezeichnung: daten.bezeichnung.trim(),
      ansatz: daten.ansatz.trim(),
      menge: effektiveMenge(daten),
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function zeileAendern(
  lvId: string,
  zeileId: string,
  daten: AufmasszeileDaten
) {
  const lv = await lvDesMandanten(lvId);
  const zeile = await prisma.aufmasszeile.findFirst({
    where: { id: zeileId, blatt: { lvId } },
  });
  if (!zeile) throw new Error("Aufmaßzeile nicht gefunden");
  if (zeile.rechnungId) {
    throw new Error("Zeile ist bereits abgerechnet und kann nicht geändert werden");
  }
  await prisma.aufmasszeile.update({
    where: { id: zeileId },
    data: {
      bezeichnung: daten.bezeichnung.trim(),
      ansatz: daten.ansatz.trim(),
      menge: effektiveMenge(daten),
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function zeileLoeschen(lvId: string, zeileId: string) {
  const lv = await lvDesMandanten(lvId);
  await prisma.aufmasszeile.deleteMany({
    where: { id: zeileId, blatt: { lvId }, rechnungId: null },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

// ── Rechnungen ───────────────────────────────────────────────────────

/**
 * Erstellt eine Rechnung und ordnet ihr alle noch nicht abgerechneten
 * Aufmaßzeilen des LV zu. Nach einer Schlussrechnung sind keine weiteren
 * Rechnungen möglich; vor der Schlussrechnung müssen alle Entwürfe gelegt
 * oder gelöscht sein (ihre Zahlbeträge gehen in die SR-Abrechnung ein).
 */
export async function rechnungErstellen(lvId: string, art: RechnungArt) {
  const lv = await lvDesMandanten(lvId);

  const rechnungId = await prisma.$transaction(async (tx) => {
    const schlussrechnungen = await tx.rechnung.count({
      where: { lvId, art: "SCHLUSSRECHNUNG" },
    });
    if (schlussrechnungen > 0) {
      throw new Error(
        "Es existiert bereits eine Schlussrechnung – weitere Rechnungen sind nicht möglich"
      );
    }
    if (art === "SCHLUSSRECHNUNG") {
      const entwuerfe = await tx.rechnung.count({
        where: { lvId, status: "ENTWURF" },
      });
      if (entwuerfe > 0) {
        throw new Error(
          "Vor der Schlussrechnung müssen alle Entwurfsrechnungen gelegt oder gelöscht werden"
        );
      }
    }

    // Eine Schlussrechnung ist auch ohne neue offene Zeilen möglich (reine
    // Endabrechnung: Rücklassauflösung, wenn bereits alles über
    // Teilrechnungen abgerechnet wurde). Sie braucht aber überhaupt
    // abgerechnete Leistung im LV.
    if (art === "SCHLUSSRECHNUNG") {
      const abgerechnet = await tx.aufmasszeile.count({
        where: { blatt: { lvId } },
      });
      if (abgerechnet === 0) {
        throw new Error("Es sind noch keine Aufmaßzeilen erfasst");
      }
    }

    const max = await tx.rechnung.aggregate({
      where: { lvId },
      _max: { nummer: true },
    });
    const rechnung = await tx.rechnung.create({
      data: { lvId, nummer: (max._max.nummer ?? 0) + 1, art },
    });
    // Bedingung rechnungId: null verhindert, dass parallel erstellte
    // Rechnungen einander die Zeilen wegnehmen.
    const zugeordnet = await tx.aufmasszeile.updateMany({
      where: { blatt: { lvId }, rechnungId: null },
      data: { rechnungId: rechnung.id },
    });
    if (art === "TEILRECHNUNG" && zugeordnet.count === 0) {
      throw new Error("Keine offenen Aufmaßzeilen vorhanden");
    }
    return rechnung.id;
  });

  revalidatePath(abrechnungPfad(lv.projektId, lvId));
  redirect(`${abrechnungPfad(lv.projektId, lvId)}/rechnungen/${rechnungId}`);
}

/**
 * Legt eine Entwurfsrechnung: friert Beträge, Einheitspreise und
 * Konditionen als Snapshot ein. Bei der Schlussrechnung wird kumulativ
 * über alle abgerechneten Zeilen des LV gerechnet und die Zahlbeträge der
 * Teilrechnungen werden abgezogen.
 */
async function rechnungLegen(lvId: string, rechnungId: string) {
  await prisma.$transaction(async (tx) => {
    const rechnung = await tx.rechnung.findFirst({
      where: { id: rechnungId, lvId },
      include: { lv: true, zeilen: true },
    });
    if (!rechnung) throw new Error("Rechnung nicht gefunden");
    if (rechnung.status !== "ENTWURF") {
      throw new Error("Nur Entwürfe können gelegt werden");
    }

    let basisZeilen = rechnung.zeilen;
    let bereitsVerrechnet = 0;
    if (rechnung.art === "SCHLUSSRECHNUNG") {
      basisZeilen = await tx.aufmasszeile.findMany({
        where: { blatt: { lvId }, rechnungId: { not: null } },
      });
      const andere = await tx.rechnung.findMany({
        where: { lvId, id: { not: rechnung.id } },
      });
      if (andere.some((r) => r.status === "ENTWURF")) {
        throw new Error(
          "Vor der Schlussrechnung müssen alle Entwurfsrechnungen gelegt oder gelöscht werden"
        );
      }
      bereitsVerrechnet = andere.reduce(
        (acc, r) => acc + Number(r.zahlbetrag ?? 0),
        0
      );
    }

    // Mengen je Position aggregieren und mit den aktuellen EPs bewerten
    const mengeJePosition = new Map<string, number>();
    for (const z of basisZeilen) {
      mengeJePosition.set(
        z.positionId,
        (mengeJePosition.get(z.positionId) ?? 0) + Number(z.menge)
      );
    }
    const positionen = await tx.position.findMany({
      where: { id: { in: Array.from(mengeJePosition.keys()) } },
      select: { id: true, epLohn: true, epSonstiges: true },
    });
    const epJePosition = new Map(
      positionen.map((p) => [p.id, runde2(Number(p.epLohn) + Number(p.epSonstiges))])
    );

    const netto = nettoAusBloecken(
      Array.from(mengeJePosition.entries()).map(([positionId, menge]) => ({
        menge,
        ep: epJePosition.get(positionId) ?? 0,
      }))
    );
    const ruecklassSatz =
      rechnung.art === "TEILRECHNUNG"
        ? Number(rechnung.lv.deckungsruecklass)
        : Number(rechnung.lv.haftruecklass);
    const summen = rechnungsSummen(
      netto,
      {
        ruecklassSatz,
        ustSatz: Number(rechnung.lv.ustSatz),
        skontoSatz: Number(rechnung.lv.skonto),
        skontoTage: rechnung.lv.skontoTage,
      },
      bereitsVerrechnet
    );

    const jetzt = new Date();
    const gelegt = await tx.rechnung.updateMany({
      where: { id: rechnung.id, status: "ENTWURF" },
      data: {
        status: "GELEGT",
        datum: jetzt,
        gelegtAm: jetzt,
        netto: summen.netto,
        ruecklassSatz,
        ustSatz: rechnung.lv.ustSatz,
        skontoSatz: rechnung.lv.skonto,
        skontoTage: rechnung.lv.skontoTage,
        bereitsVerrechnet: summen.bereitsVerrechnet,
        zahlbetrag: summen.zahlbetrag,
      },
    });
    if (gelegt.count === 0) throw new Error("Rechnung wurde bereits gelegt");

    await tx.rechnungsPosition.createMany({
      data: Array.from(mengeJePosition.keys()).map((positionId) => ({
        rechnungId: rechnung.id,
        positionId,
        ep: epJePosition.get(positionId) ?? 0,
      })),
    });
  });
}

/** Erlaubte Übergänge: ENTWURF → GELEGT (mit Snapshot), GELEGT → BEZAHLT. */
export async function rechnungStatusSetzen(
  lvId: string,
  rechnungId: string,
  status: RechnungStatus
) {
  const lv = await lvDesMandanten(lvId);
  if (status === "GELEGT") {
    await rechnungLegen(lvId, rechnungId);
  } else if (status === "BEZAHLT") {
    const bezahlt = await prisma.rechnung.updateMany({
      where: { id: rechnungId, lvId, status: "GELEGT" },
      data: { status: "BEZAHLT" },
    });
    if (bezahlt.count === 0) {
      throw new Error("Nur gelegte Rechnungen können als bezahlt markiert werden");
    }
  } else {
    throw new Error("Dieser Statuswechsel ist nicht zulässig");
  }
  revalidatePath(`${abrechnungPfad(lv.projektId, lvId)}/rechnungen/${rechnungId}`);
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

/** Löscht eine Rechnung (nur im Entwurf); die Aufmaßzeilen werden wieder offen. */
export async function rechnungLoeschen(lvId: string, rechnungId: string) {
  const lv = await lvDesMandanten(lvId);
  const geloescht = await prisma.rechnung.deleteMany({
    where: { id: rechnungId, lvId, status: "ENTWURF" },
  });
  if (geloescht.count === 0) {
    const rechnung = await prisma.rechnung.findFirst({
      where: { id: rechnungId, lvId },
    });
    if (!rechnung) return;
    throw new Error("Nur Rechnungen im Entwurf können gelöscht werden");
  }
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
  redirect(abrechnungPfad(lv.projektId, lvId));
}
