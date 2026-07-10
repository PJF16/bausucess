import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  rechnungLoeschen,
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

const statusLabel: Record<string, string> = {
  ENTWURF: "Entwurf",
  GELEGT: "Gelegt",
  BEZAHLT: "Bezahlt",
};

export default async function RechnungPage({
  params,
}: {
  params: Promise<{ projektId: string; lvId: string; rechnungId: string }>;
}) {
  const { projektId, lvId, rechnungId } = await params;
  const user = await requireUser();

  const rechnung = await prisma.rechnung.findFirst({
    where: {
      id: rechnungId,
      lv: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    },
    include: {
      lv: { include: { projekt: true } },
      zeilen: {
        orderBy: { sortier: "asc" },
        include: { position: true, blatt: true },
      },
    },
  });
  if (!rechnung) notFound();

  // Zeilen je Position gruppieren
  const jePosition = new Map<
    string,
    { position: (typeof rechnung.zeilen)[number]["position"]; zeilen: typeof rechnung.zeilen }
  >();
  for (const z of rechnung.zeilen) {
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

  const netto = positionsBloecke.reduce((acc, block) => {
    const menge = block.zeilen.reduce((m, z) => m + Number(z.menge), 0);
    const ep = Number(block.position.epLohn) + Number(block.position.epSonstiges);
    return acc + menge * ep;
  }, 0);

  // Rücklass: Deckungsrücklass bei Teilrechnungen, Haftrücklass bei der
  // Schlussrechnung. USt wird vom geminderten Betrag gerechnet.
  const ruecklassSatz =
    rechnung.art === "TEILRECHNUNG"
      ? Number(rechnung.lv.deckungsruecklass)
      : Number(rechnung.lv.haftruecklass);
  const ruecklassLabel =
    rechnung.art === "TEILRECHNUNG" ? "Deckungsrücklass" : "Haftrücklass";
  const ruecklass = (netto * ruecklassSatz) / 100;
  const zwischensumme = netto - ruecklass;
  const ustSatz = Number(rechnung.lv.ustSatz);
  const ust = (zwischensumme * ustSatz) / 100;
  const brutto = zwischensumme + ust;
  const skontoSatz = Number(rechnung.lv.skonto);
  const skontoBetrag = (brutto * skontoSatz) / 100;

  const basisPfad = `/projekte/${projektId}/lv/${lvId}/abrechnung`;
  const artLabel =
    rechnung.art === "SCHLUSSRECHNUNG" ? "Schlussrechnung" : "Teilrechnung";

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-1 text-xs text-slate-500 print:hidden">
        <Link href="/" className="hover:underline">Projekte</Link>
        {" / "}
        <Link href={`/projekte/${projektId}`} className="hover:underline">
          {rechnung.lv.projekt.nummer} {rechnung.lv.projekt.bezeichnung}
        </Link>
        {" / "}
        <Link href={basisPfad} className="hover:underline">
          {rechnung.lv.bezeichnung} – Abrechnung
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {artLabel} Nr. {rechnung.nummer}
          </h1>
          <p className="text-sm text-slate-500">
            {rechnung.datum.toLocaleDateString("de-AT")} ·{" "}
            {rechnung.lv.projekt.auftraggeber ?? "–"} · Status:{" "}
            <span className="font-semibold">{statusLabel[rechnung.status]}</span>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <DruckButton />
          {user.rolle !== "LESER" && rechnung.status === "ENTWURF" && (
            <>
              <form
                action={rechnungStatusSetzen.bind(null, lvId, rechnung.id, "GELEGT")}
              >
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
              action={rechnungStatusSetzen.bind(null, lvId, rechnung.id, "BEZAHLT")}
            >
              <button className="rounded bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800">
                Als bezahlt markieren
              </button>
            </form>
          )}
        </div>
      </div>

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
            {positionsBloecke.map(({ position, zeilen }) => {
              const menge = zeilen.reduce((m, z) => m + Number(z.menge), 0);
              const ep = Number(position.epLohn) + Number(position.epSonstiges);
              return (
                <tr key={position.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{position.nummer}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{position.stichwort}</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {zeilen.map((z) => (
                        <li key={z.id} className="flex gap-2">
                          <span className="text-slate-400">
                            Blatt {z.blatt.nummer}
                          </span>
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
                    {euro.format(menge * ep)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 text-sm">
            <tr>
              <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                Leistungssumme netto
              </td>
              <td className="px-3 py-1.5 text-right font-mono font-semibold">
                {euro.format(netto)}
              </td>
            </tr>
            {ruecklassSatz > 0 && (
              <>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    abzüglich {ruecklassLabel} {ruecklassSatz} %
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-red-700">
                    −{euro.format(ruecklass)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                    Zwischensumme
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {euro.format(zwischensumme)}
                  </td>
                </tr>
              </>
            )}
            <tr>
              <td colSpan={5} className="px-3 py-1.5 text-right text-slate-600">
                USt {ustSatz} %
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {euro.format(ust)}
              </td>
            </tr>
            <tr className="text-base">
              <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                Zahlbetrag brutto
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold">
                {euro.format(brutto)}
              </td>
            </tr>
            {skontoSatz > 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-1.5 text-right text-xs text-slate-500">
                  Bei Zahlung binnen {rechnung.lv.skontoTage} Tagen abzüglich{" "}
                  {skontoSatz} % Skonto ({euro.format(skontoBetrag)})
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-600">
                  {euro.format(brutto - skontoBetrag)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
