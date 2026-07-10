import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { euro, lvArtLabel, positionsBetrag } from "@/lib/labels";

export default async function KalkulationUebersichtPage() {
  const user = await requireUser();
  const lvs = await prisma.lv.findMany({
    where: { projekt: { tenantId: user.tenantId } },
    orderBy: [{ projekt: { nummer: "asc" } }, { createdAt: "desc" }],
    include: {
      projekt: { select: { id: true, nummer: true, bezeichnung: true } },
      positionen: {
        select: { menge: true, epLohn: true, epSonstiges: true, art: true },
      },
      kalkulation: {
        include: { ansaetze: { select: { positionId: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-xl font-bold">Kalkulation</h1>
      <p className="mb-6 text-sm text-slate-500">
        Wählen Sie das Leistungsverzeichnis, das Sie kalkulieren möchten.
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Projekt</th>
              <th className="px-4 py-2">Leistungsverzeichnis</th>
              <th className="px-4 py-2">Art</th>
              <th className="px-4 py-2 text-right">Kalkuliert</th>
              <th className="px-4 py-2 text-right">LV-Summe netto</th>
            </tr>
          </thead>
          <tbody>
            {lvs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Noch keine Leistungsverzeichnisse vorhanden – legen Sie zuerst
                  ein Projekt mit LV an.
                </td>
              </tr>
            )}
            {lvs.map((lv) => {
              const kalkulierte = new Set(
                lv.kalkulation?.ansaetze.map((a) => a.positionId) ?? []
              ).size;
              const netto = lv.positionen.reduce(
                (acc, p) => acc + positionsBetrag(p),
                0
              );
              return (
                <tr key={lv.id} className="border-t border-slate-100 hover:bg-blue-50">
                  <td className="px-4 py-2 text-slate-500">
                    <span className="font-mono text-xs">{lv.projekt.nummer}</span>{" "}
                    {lv.projekt.bezeichnung}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/projekte/${lv.projekt.id}/lv/${lv.id}/kalkulation`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {lv.bezeichnung}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {lvArtLabel[lv.art]}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={
                        kalkulierte === lv.positionen.length &&
                        lv.positionen.length > 0
                          ? "text-green-700"
                          : kalkulierte > 0
                            ? "text-amber-600"
                            : "text-slate-400"
                      }
                    >
                      {kalkulierte} / {lv.positionen.length} Positionen
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {euro.format(netto)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
