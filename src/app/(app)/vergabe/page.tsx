import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { euro, lvArtLabel } from "@/lib/labels";

export default async function VergabeUebersichtPage() {
  const user = await requireUser();
  const lvs = await prisma.lv.findMany({
    where: { projekt: { tenantId: user.tenantId } },
    orderBy: [{ projekt: { nummer: "asc" } }, { createdAt: "desc" }],
    include: {
      projekt: { select: { id: true, nummer: true, bezeichnung: true } },
      positionen: { select: { id: true, menge: true, art: true } },
      angebote: {
        include: {
          bieter: { select: { firma: true } },
          preise: { select: { positionId: true, ep: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-xl font-bold">Ausschreibung &amp; Vergabe</h1>
      <p className="mb-6 text-sm text-slate-500">
        Wählen Sie das Leistungsverzeichnis, dessen Preisspiegel Sie bearbeiten
        möchten. Bieter verwalten Sie{" "}
        <Link href="/bieter" className="text-blue-700 hover:underline">
          hier
        </Link>
        .
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Projekt</th>
              <th className="px-4 py-2">Leistungsverzeichnis</th>
              <th className="px-4 py-2">Art</th>
              <th className="px-4 py-2 text-right">Bieter</th>
              <th className="px-4 py-2 text-right">Günstigstes Angebot</th>
              <th className="px-4 py-2">Vergabestand</th>
            </tr>
          </thead>
          <tbody>
            {lvs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Noch keine Leistungsverzeichnisse vorhanden.
                </td>
              </tr>
            )}
            {lvs.map((lv) => {
              const mengeJePosition = new Map(
                lv.positionen
                  .filter((p) => p.art !== "EVENTUAL" && p.art !== "ALTERNATIV")
                  .map((p) => [p.id, Number(p.menge)])
              );
              const summen = lv.angebote
                .map((a) =>
                  a.preise.reduce(
                    (acc, pr) =>
                      acc +
                      (mengeJePosition.get(pr.positionId) ?? 0) * Number(pr.ep),
                    0
                  )
                )
                .filter((s) => s > 0);
              const min = summen.length ? Math.min(...summen) : null;
              const zuschlag = lv.angebote.find((a) => a.status === "ZUSCHLAG");
              return (
                <tr key={lv.id} className="border-t border-slate-100 hover:bg-blue-50">
                  <td className="px-4 py-2 text-slate-500">
                    <span className="font-mono text-xs">{lv.projekt.nummer}</span>{" "}
                    {lv.projekt.bezeichnung}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/projekte/${lv.projekt.id}/lv/${lv.id}/vergabe`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {lv.bezeichnung}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {lvArtLabel[lv.art]}
                  </td>
                  <td className="px-4 py-2 text-right">{lv.angebote.length}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {min !== null ? euro.format(min) : "–"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {zuschlag ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">
                        Zuschlag: {zuschlag.bieter.firma}
                      </span>
                    ) : lv.angebote.length > 0 ? (
                      <span className="text-slate-500">offen</span>
                    ) : (
                      <span className="text-slate-400">keine Bieter</span>
                    )}
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
