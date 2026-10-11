import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { runde2 } from "@/lib/kalk";
import { nettoAusBloecken, rechnungsSummen } from "@/lib/rechnung";
import {
  rechnungLoeschen,
  rechnungStornieren,
  rechnungStatusSetzen,
} from "@/lib/actions/abrechnung";
import { DruckButton } from "@/components/druck-button";

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

type BelegZeile = {
  id: string;
  positionId: string;
  bezeichnung: string;
  ansatz: string;
  menge: unknown;
  sourceRechnungNummer?: number | null;
  blatt: { nummer: number; bezeichnung: string };
  rechnung: { id: string; nummer: number; art: string } | null;
  position: {
    id: string;
    nummer: string;
    stichwort: string;
    langtext: string;
    einheit: string;
    epLohn: unknown;
    epSonstiges: unknown;
    menge?: unknown;
  };
};

const statusLabel: Record<string, string> = {
  ENTWURF: "Entwurf",
  GELEGT: "Gelegt",
  BEZAHLT: "Bezahlt",
  STORNIERT: "Storniert",
};

export default async function RechnungPage({
  params,
  searchParams,
}: {
  params: Promise<{ projektId: string; lvId: string; rechnungId: string }>;
  searchParams?: Promise<{ fehler?: string }>;
}) {
  const { projektId, lvId, rechnungId } = await params;
  const fehler = (await searchParams)?.fehler;
  const user = await requireUser();

  const rechnung = await prisma.rechnung.findFirst({
    where: {
      id: rechnungId,
      lv: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    },
    include: {
      lv: { include: { projekt: true } },
      positionen: true, // EP-Snapshot ab Legung
      snapshotZeilen: { orderBy: [{ blattNummer: "asc" }, { sortier: "asc" }] },
      zeilen: {
        orderBy: { sortier: "asc" },
        include: { position: true, blatt: true },
      },
    },
  });
  if (!rechnung) notFound();

  const istSchlussrechnung = rechnung.art === "SCHLUSSRECHNUNG";
  const istGelegt = rechnung.status !== "ENTWURF";

  // Alle abgerechneten Zeilen des LV: Basis der kumulativen Schlussrechnung
  // und der Überabrechnungs-Prüfung.
  const alleAbgerechnet = await prisma.aufmasszeile.findMany({
    where: { blatt: { lvId }, rechnungId: { not: null } },
    orderBy: { sortier: "asc" },
    include: {
      position: true,
      blatt: true,
      rechnung: { select: { id: true, nummer: true, art: true } },
    },
  });
  const teilrechnungen = istSchlussrechnung
    ? await prisma.rechnung.findMany({
        where: { lvId, art: "TEILRECHNUNG", status: { not: "STORNIERT" } },
        orderBy: { nummer: "asc" },
      })
    : [];

  // EP je Position: nach Legung aus dem Snapshot, davor live aus dem LV
  const epSnapshot = new Map(
    rechnung.positionen.map((p) => [p.positionId, Number(p.ep)])
  );
  const epFuer = (positionId: string, live: number) =>
    istGelegt ? (epSnapshot.get(positionId) ?? live) : live;

  // Zeilenbasis: TR rechnet die eigenen Zeilen ab, SR kumulativ alle
  const liveBasisZeilen = istSchlussrechnung
    ? alleAbgerechnet
    : rechnung.zeilen.map((z) => ({
        ...z,
        rechnung: { id: rechnung.id, nummer: rechnung.nummer, art: rechnung.art },
      }));

  const basisZeilen: BelegZeile[] = istGelegt
    ? rechnung.snapshotZeilen.map((z) => ({
        id: z.id,
        positionId: z.positionId,
        bezeichnung: z.zeilenBezeichnung,
        ansatz: z.ansatz,
        menge: z.menge,
        sourceRechnungNummer: z.sourceRechnungNummer,
        blatt: { nummer: z.blattNummer, bezeichnung: z.blattBezeichnung },
        rechnung: { id: rechnung.id, nummer: rechnung.nummer, art: rechnung.art },
        position: {
          id: z.positionId,
          nummer: z.positionsNummer,
          stichwort: z.positionStichwort,
          langtext: z.positionLangtext,
          einheit: z.einheit,
          epLohn: z.ep,
          epSonstiges: 0,
        },
      }))
    : liveBasisZeilen.map((z) => ({
        ...z,
        rechnung: z.rechnung ? { id: z.rechnung.id, nummer: z.rechnung.nummer, art: z.rechnung.art } : null,
      }));

  const jePosition = new Map<
    string,
    { position: BelegZeile["position"]; zeilen: BelegZeile[] }
  >();
  for (const z of basisZeilen) {
    const eintrag = jePosition.get(z.positionId) ?? {
      position: z.position,
      zeilen: [],
    };
    eintrag.zeilen.push(z);
    jePosition.set(z.positionId, eintrag);
  }
  const positionsBloecke = Array.from(jePosition.values()).sort((a, b) =>
    a.position.nummer.localeCompare(b.position.nummer)
  );

  // Kumulierte abgerechnete Menge je Position (für Überabrechnungs-Hinweis)
  const abgerechnetJePosition = new Map<string, number>();
  for (const z of alleAbgerechnet) {
    abgerechnetJePosition.set(
      z.positionId,
      (abgerechnetJePosition.get(z.positionId) ?? 0) + Number(z.menge)
    );
  }

  const bloecke = positionsBloecke.map(({ position, zeilen }) => {
    const menge = zeilen.reduce((m, z) => m + Number(z.menge), 0);
    const ep = epFuer(
      position.id,
      runde2(Number(position.epLohn) + Number(position.epSonstiges))
    );
    const sollMenge = istGelegt ? 0 : Number(position.menge);
    const kumuliert = abgerechnetJePosition.get(position.id) ?? 0;
    return {
      position,
      zeilen,
      menge,
      ep,
      betrag: runde2(menge * ep),
      ueberschritten: sollMenge > 0 && kumuliert > sollMenge,
      sollMenge,
      kumuliert,
    };
  });

  // Beträge: nach Legung aus dem Snapshot, davor live berechnet
  const nettoLive = nettoAusBloecken(bloecke);
  const netto =
    istGelegt && rechnung.netto !== null ? Number(rechnung.netto) : nettoLive;
  const ruecklassSatz = Number(
    rechnung.ruecklassSatz ??
      (istSchlussrechnung ? rechnung.lv.haftruecklass : rechnung.lv.deckungsruecklass)
  );
  const kond = {
    ruecklassSatz,
    ustSatz: Number(rechnung.ustSatz ?? rechnung.lv.ustSatz),
    skontoSatz: Number(rechnung.skontoSatz ?? rechnung.lv.skonto),
    skontoTage: rechnung.skontoTage ?? rechnung.lv.skontoTage,
  };
  const bereitsVerrechnet =
    istGelegt && rechnung.bereitsVerrechnet !== null
      ? Number(rechnung.bereitsVerrechnet)
      : teilrechnungen.reduce((acc, r) => acc + Number(r.zahlbetrag ?? 0), 0);
  const summen = rechnungsSummen(netto, kond, bereitsVerrechnet);

  const ruecklassLabel = istSchlussrechnung ? "Haftrücklass" : "Deckungsrücklass";
  const ueberschrittene = bloecke.filter((b) => b.ueberschritten);

  const basisPfad = `/projekte/${projektId}/lv/${lvId}/abrechnung`;
  const artLabel = istSchlussrechnung ? "Schlussrechnung" : "Teilrechnung";
  const rechnungKey = rechnung.id;

  async function statusAktion(formData: FormData) {
    "use server";
    try {
      const status = String(formData.get("status"));
      if (status !== "GELEGT" && status !== "BEZAHLT") throw new Error("Ungültiger Status");
      await rechnungStatusSetzen(lvId, rechnungKey, status);
    } catch (error) {
      redirect(`${basisPfad}/rechnungen/${rechnungKey}?fehler=${encodeURIComponent(error instanceof Error ? error.message : "Rechnung konnte nicht geändert werden")}`);
    }
  }

  async function stornoAktion(formData: FormData) {
    "use server";
    try {
      await rechnungStornieren(lvId, rechnungKey, String(formData.get("grund") ?? ""));
    } catch (error) {
      redirect(`${basisPfad}/rechnungen/${rechnungKey}?fehler=${encodeURIComponent(error instanceof Error ? error.message : "Storno konnte nicht durchgeführt werden")}`);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-1 text-xs text-slate-500 print:hidden">
        <Link href="/" className="hover:underline">Projekte</Link>
        {" / "}
        <Link href={`/projekte/${projektId}`} className="hover:underline">
          {istGelegt
            ? `${rechnung.snapshotProjektNummer ?? rechnung.lv.projekt.nummer} ${rechnung.snapshotProjektBezeichnung ?? rechnung.lv.projekt.bezeichnung}`
            : `${rechnung.lv.projekt.nummer} ${rechnung.lv.projekt.bezeichnung}`}
        </Link>
        {" / "}
        <Link href={basisPfad} className="hover:underline">
            {istGelegt ? rechnung.snapshotLvBezeichnung ?? rechnung.lv.bezeichnung : rechnung.lv.bezeichnung} – Abrechnung
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {artLabel} Nr. {rechnung.nummer}
          </h1>
          <p className="text-sm text-slate-500">
            {rechnung.datum.toLocaleDateString("de-AT")} ·{" "}
            {(istGelegt ? rechnung.snapshotAuftraggeber : rechnung.lv.projekt.auftraggeber) ?? "–"} · Status:{" "}
            <span className="font-semibold">{statusLabel[rechnung.status]}</span>
            {rechnung.gelegtAm && (
              <> · gelegt am {rechnung.gelegtAm.toLocaleDateString("de-AT")}</>
            )}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <DruckButton />
          {user.rolle !== "LESER" && rechnung.status === "ENTWURF" && (
            <>
              <form
                action={statusAktion}
              >
                <input type="hidden" name="status" value="GELEGT" />
                <button className="rounded bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900">
                  Rechnung legen
                </button>
              </form>
              <form action={rechnungLoeschen.bind(null, lvId, rechnung.id)}>
                <button className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                  Entwurf löschen
                </button>
              </form>
            </>
          )}
          {user.rolle !== "LESER" && rechnung.status === "GELEGT" && (
            <form
              action={statusAktion}
            >
              <input type="hidden" name="status" value="BEZAHLT" />
              <button className="rounded bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800">
                Als bezahlt markieren
              </button>
            </form>
          )}
          {user.rolle !== "LESER" && rechnung.status === "GELEGT" && (
            <form action={stornoAktion} className="flex gap-1">
              <input name="grund" required minLength={3} placeholder="Stornogrund" aria-label="Stornogrund" className="w-32 rounded border px-2 py-1 text-xs" />
              <button className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Stornieren</button>
            </form>
          )}
        </div>
      </div>

      {rechnung.status === "ENTWURF" && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          Entwurf – die Beträge folgen den aktuellen Einheitspreisen und
          LV-Konditionen. Beim Legen werden sie eingefroren.
        </p>
      )}
      {rechnung.status === "STORNIERT" && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Storniert am {rechnung.storniertAm?.toLocaleDateString("de-AT")} · Grund: {rechnung.stornoGrund ?? "–"}. Dieser Beleg bleibt als historische Kopie erhalten.
        </p>
      )}
      {rechnung.status === "BEZAHLT" && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          Diese Rechnung ist als bezahlt markiert. Rückzahlung und Gutschrift können in der Abrechnung noch nicht erfasst werden; daher ist ein Storno hier gesperrt.
        </p>
      )}
      {fehler && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fehler}</p>}
      {ueberschrittene.length > 0 && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 print:hidden">
          ⚠ Überabrechnung: Bei {ueberschrittene.length}{" "}
          {ueberschrittene.length === 1 ? "Position liegt" : "Positionen liegt"}{" "}
          die abgerechnete Menge über der LV-Menge (
          {ueberschrittene.map((b) => b.position.nummer).join(", ")}).
        </p>
      )}
      {istSchlussrechnung && (
        <p className="mb-4 text-xs text-slate-500">
          Die Schlussrechnung rechnet die Gesamtleistung kumuliert ab; die
          Zahlbeträge der Teilrechnungen werden abgezogen, der einbehaltene
          Deckungsrücklass ist damit aufgelöst.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Pos.-Nr.</th>
              <th className="px-3 py-2">Bezeichnung</th>
              <th className="px-3 py-2 text-right">Menge</th>
              <th className="px-3 py-2 text-center">ME</th>
              <th className="px-3 py-2 text-right">EP</th>
              <th className="px-3 py-2 text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {bloecke.map(({ position, zeilen, menge, ep, betrag, ueberschritten, sollMenge }) => (
              <tr key={position.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 font-mono text-xs">{position.nummer}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {position.stichwort}
                    {ueberschritten && (
                      <span
                        className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                        title={`Abgerechnet ${zahl.format(abgerechnetJePosition.get(position.id) ?? 0)} von ${zahl.format(sollMenge)} ${position.einheit} LV-Menge`}
                      >
                        ⚠ über LV-Menge
                      </span>
                    )}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {zeilen.map((z) => (
                      <li key={z.id} className="flex gap-2">
                        <span className="text-slate-400">
                          Blatt {z.blatt.nummer}
                        </span>
                        {istSchlussrechnung && z.sourceRechnungNummer && z.sourceRechnungNummer !== rechnung.nummer && (
                          <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                            TR {z.sourceRechnungNummer}
                          </span>
                        )}
                        <span>{z.bezeichnung || "–"}</span>
                        {z.ansatz && (
                          <span className="font-mono text-slate-400">
                            {z.ansatz} =
                          </span>
                        )}
                        <span className="ml-auto font-mono">
                          {zahl.format(Number(z.menge))} {position.einheit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {zahl.format(menge)}
                </td>
                <td className="px-3 py-2 text-center text-xs text-slate-500">
                  {position.einheit}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {zahl.format(ep)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                  {euro.format(betrag)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 text-sm">
            <tr>
              <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                {istSchlussrechnung
                  ? "Gesamtleistung netto (kumuliert)"
                  : "Leistungssumme netto"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono font-semibold">
                {euro.format(summen.netto)}
              </td>
            </tr>
            {kond.ruecklassSatz > 0 && (
              <>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    abzüglich {ruecklassLabel} {kond.ruecklassSatz} %
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-red-700">
                    −{euro.format(summen.ruecklassBetrag)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    Zwischensumme
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {euro.format(summen.zwischensumme)}
                  </td>
                </tr>
              </>
            )}
            <tr>
              <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                USt {kond.ustSatz} %
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {euro.format(summen.ustBetrag)}
              </td>
            </tr>
            {istSchlussrechnung && (
              <>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    Bruttosumme (kumuliert)
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {euro.format(summen.brutto)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    abzüglich bereits verrechneter Teilrechnungen
                    {!istGelegt && teilrechnungen.length > 0 && (
                      <span className="text-xs text-slate-400">
                        {" "}
                        (TR {teilrechnungen.map((r) => r.nummer).join(", ")})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-red-700">
                    −{euro.format(summen.bereitsVerrechnet)}
                  </td>
                </tr>
              </>
            )}
            <tr className="text-base">
              <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                Zahlbetrag brutto
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold">
                {euro.format(summen.zahlbetrag)}
              </td>
            </tr>
            {kond.skontoSatz > 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-1.5 text-right text-xs text-slate-500">
                  Bei Zahlung binnen {kond.skontoTage} Tagen abzüglich{" "}
                  {kond.skontoSatz} % Skonto ({euro.format(summen.skontoBetrag)})
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600">
                  {euro.format(runde2(summen.zahlbetrag - summen.skontoBetrag))}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
