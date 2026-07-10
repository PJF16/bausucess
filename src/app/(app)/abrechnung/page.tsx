import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { euro, lvArtLabel } from "@/lib/labels";

export default async function AbrechnungUebersichtPage() {
  const user = await requireUser();
  const lvs = await prisma.lv.findMany({
    where: { projekt: { tenantId: user.tenantId } },
    orderBy: [{ projekt: { nummer: "asc" } }, { createdAt: "desc" }],
    include: {
      projekt: { select: { id: true, nummer: true, bezeichnung: true } },
      rechnungen: { select: { id: true } },
      aufmassblaetter: {
        include: {
          zeilen: {
            select: {
              menge: true,
              rechnungId: true,
              position: { select: { epLohn: true, epSonstiges: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-xl font-bold">Abrechnung</h1>
      <p className="mb-6 text-sm text-slate-500">
        Wählen Sie das Leistungsverzeichnis, dessen Aufmaße und Rechnungen Sie
        bearbeiten möchten – üblicherweise das Vertrags-LV.
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Projekt</th>
              <th className="px-4 py-2">Leistungsverzeichnis</th>
              <th className="px-4 py-2">Art</th>
              <th className="px-4 py-2 text-right">Offenes Aufmaß</th>
              <th className="px-4 py-2 text-right">Abgerechnet netto</th>
              <th className="px-4 py-2 text-right">Rechnungen</th>
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
              const zeilen = lv.aufmassblaetter.flatMap((b) => b.zeilen);
              const betrag = (z: (typeof zeilen)[number]) =>
                Number(z.menge) *
                (Number(z.position.epLohn) + Number(z.position.epSonstiges));
              const offen = zeilen.filter((z) => z.rechnungId === null);
              const abgerechnet = zeilen
                .filter((z) => z.rechnungId !== null)
                .reduce((acc, z) => acc + betrag(z), 0);
              const offenBetrag = offen.reduce((acc, z) => acc + betrag(z), 0);
              return (
                <tr key={lv.id} className="border-t border-slate-100 hover:bg-blue-50">
                  <td className="px-4 py-2 text-slate-500">
                    <span className="font-mono text-xs">{lv.projekt.nummer}</span>{" "}
                    {lv.projekt.bezeichnung}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/projekte/${lv.projekt.id}/lv/${lv.id}/abrechnung`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {lv.bezeichnung}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {lvArtLabel[lv.art]}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {offen.length > 0 ? (
                      <span className="text-amber-600">
                        {offen.length} Zeilen · {euro.format(offenBetrag)}
                      </span>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {abgerechnet > 0 ? euro.format(abgerechnet) : "–"}
                  </td>
                  <td className="px-4 py-2 text-right">{lv.rechnungen.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
