import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { DruckButton } from "@/components/druck-button";
import type { LvGruppe, Position } from "@prisma/client";

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const lvArtLabel: Record<string, string> = {
  ENTWURFS_LV: "Entwurfs-LV",
  KOSTENSCHAETZUNGS_LV: "Kostenschätzungs-LV",
  AUSSCHREIBUNGS_LV: "Ausschreibungs-LV",
  ANGEBOTS_LV: "Angebots-LV",
  VERTRAGS_LV: "Vertrags-LV",
  ABRECHNUNGS_LV: "Abrechnungs-LV",
};

const posArtKuerzel: Record<string, string> = {
  WESENTLICH: "W",
  EVENTUAL: "EV",
  ALTERNATIV: "ALT",
  REGIE: "REG",
};

interface GruppenKnoten {
  gruppe: LvGruppe;
  kinder: GruppenKnoten[];
  positionen: Position[];
  summe: number;
}

function positionsSumme(p: Position): number {
  if (p.art === "EVENTUAL" || p.art === "ALTERNATIV") return 0;
  return Number(p.menge) * (Number(p.epLohn) + Number(p.epSonstiges));
}

function GruppeBlock({ knoten, pfad }: { knoten: GruppenKnoten; pfad: string }) {
  const nummer = pfad ? `${pfad}.${knoten.gruppe.nummer}` : knoten.gruppe.nummer;
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mt-5 mb-1 border-b border-slate-300 pb-1 text-sm font-bold">
        {knoten.gruppe.ebene} {nummer} {knoten.gruppe.bezeichnung}
        <span className="float-right font-mono font-semibold">
          {euro.format(knoten.summe)}
        </span>
      </h2>
      {knoten.positionen.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-16 py-1 pr-2">Pos.-Nr.</th>
              <th className="py-1 pr-2">Leistung</th>
              <th className="w-20 py-1 pr-2 text-right">Menge</th>
              <th className="w-10 py-1 pr-2">ME</th>
              <th className="w-20 py-1 pr-2 text-right">EP</th>
              <th className="w-24 py-1 text-right">Positionsbetrag</th>
            </tr>
          </thead>
          <tbody>
            {knoten.positionen.map((p) => {
              const ep = Number(p.epLohn) + Number(p.epSonstiges);
              const zaehlt = p.art !== "EVENTUAL" && p.art !== "ALTERNATIV";
              return (
                <tr key={p.id} className="break-inside-avoid border-t border-slate-100 align-top">
                  <td className="py-1 pr-2 font-mono">
                    {p.nummer}
                    {posArtKuerzel[p.art] && (
                      <span className="ml-1 text-[9px] font-bold text-slate-500">
                        {posArtKuerzel[p.art]}
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <div className="font-semibold">{p.stichwort}</div>
                    {p.langtext && (
                      <div className="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-slate-600">
                        {p.langtext}
                      </div>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {zahl.format(Number(p.menge))}
                  </td>
                  <td className="py-1 pr-2">{p.einheit}</td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {zahl.format(ep)}
                  </td>
                  <td className="py-1 text-right font-mono font-semibold">
                    {zaehlt ? euro.format(positionsSumme(p)) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {knoten.kinder.map((k) => (
        <GruppeBlock key={k.gruppe.id} knoten={k} pfad={nummer} />
      ))}
    </section>
  );
}

export default async function LvDruckPage({
  params,
}: {
  params: Promise<{ projektId: string; lvId: string }>;
}) {
  const { projektId, lvId } = await params;
  const user = await requireUser();

  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    include: {
      projekt: true,
      gruppen: { orderBy: { sortier: "asc" } },
      positionen: { orderBy: { sortier: "asc" } },
    },
  });
  if (!lv) notFound();

  // Baum mit Summen aufbauen
  const knoten = new Map<string, GruppenKnoten>();
  for (const g of lv.gruppen) {
    knoten.set(g.id, { gruppe: g, kinder: [], positionen: [], summe: 0 });
  }
  for (const p of lv.positionen) {
    knoten.get(p.gruppeId)?.positionen.push(p);
  }
  const wurzeln: GruppenKnoten[] = [];
  for (const g of lv.gruppen) {
    const node = knoten.get(g.id)!;
    if (g.parentId && knoten.has(g.parentId)) {
      knoten.get(g.parentId)!.kinder.push(node);
    } else {
      wurzeln.push(node);
    }
  }
  const summiere = (k: GruppenKnoten): number => {
    k.summe =
      k.positionen.reduce((acc, p) => acc + positionsSumme(p), 0) +
      k.kinder.reduce((acc, kind) => acc + summiere(kind), 0);
    return k.summe;
  };
  const netto = wurzeln.reduce((acc, k) => acc + summiere(k), 0);
  const ust = (netto * Number(lv.ustSatz)) / 100;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="text-xs text-slate-500">
          <Link href="/" className="hover:underline">Projekte</Link>
          {" / "}
          <Link href={`/projekte/${lv.projekt.id}`} className="hover:underline">
            {lv.projekt.nummer} {lv.projekt.bezeichnung}
          </Link>
          {" / "}
          <Link
            href={`/projekte/${lv.projekt.id}/lv/${lv.id}`}
            className="hover:underline"
          >
            {lv.bezeichnung}
          </Link>
          {" / Druckansicht"}
        </div>
        <DruckButton />
      </div>

      {/* Titelblock */}
      <header className="mb-6 border-b-2 border-slate-800 pb-4">
        <h1 className="text-xl font-bold">Leistungsverzeichnis</h1>
        <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div>
            <span className="text-slate-500">Projekt: </span>
            {lv.projekt.nummer} {lv.projekt.bezeichnung}
          </div>
          <div>
            <span className="text-slate-500">LV: </span>
            {lv.bezeichnung} ({lvArtLabel[lv.art]})
          </div>
          <div>
            <span className="text-slate-500">Auftraggeber: </span>
            {lv.projekt.auftraggeber ?? "–"}
          </div>
          <div>
            <span className="text-slate-500">Ort: </span>
            {lv.projekt.ort ?? "–"}
          </div>
        </div>
      </header>

      {wurzeln.map((k) => (
        <GruppeBlock key={k.gruppe.id} knoten={k} pfad="" />
      ))}

      {/* Zusammenfassung */}
      <section className="mt-8 break-inside-avoid border-t-2 border-slate-800 pt-3">
        <h2 className="mb-2 text-sm font-bold">Zusammenstellung</h2>
        <table className="ml-auto w-72 text-sm">
          <tbody>
            <tr>
              <td className="py-0.5 text-slate-600">Summe netto</td>
              <td className="py-0.5 text-right font-mono font-semibold">
                {euro.format(netto)}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 text-slate-600">
                USt {zahl.format(Number(lv.ustSatz))} %
              </td>
              <td className="py-0.5 text-right font-mono">{euro.format(ust)}</td>
            </tr>
            <tr className="border-t border-slate-400 text-base">
              <td className="py-1 font-bold">Summe brutto</td>
              <td className="py-1 text-right font-mono font-bold">
                {euro.format(netto + ust)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-8 text-[10px] text-slate-400 print:fixed print:bottom-2">
        Erstellt mit BauSuccess Web · {new Date().toLocaleDateString("de-AT")}
      </footer>
    </div>
  );
}
