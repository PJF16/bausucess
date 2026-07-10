import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { lvAnlegen } from "@/lib/actions/projekte";
import { OnlvImportForm } from "@/components/onlv-import-form";
import { ProjektEinstellungen } from "@/components/projekt-einstellungen";

const lvArtLabel: Record<string, string> = {
  ENTWURFS_LV: "Entwurfs-LV",
  KOSTENSCHAETZUNGS_LV: "Kostenschätzungs-LV",
  AUSSCHREIBUNGS_LV: "Ausschreibungs-LV",
  ANGEBOTS_LV: "Angebots-LV",
  VERTRAGS_LV: "Vertrags-LV",
  ABRECHNUNGS_LV: "Abrechnungs-LV",
};

export default async function ProjektPage({
  params,
}: {
  params: Promise<{ projektId: string }>;
}) {
  const { projektId } = await params;
  const user = await requireUser();
  const projekt = await prisma.projekt.findFirst({
    where: { id: projektId, tenantId: user.tenantId },
    include: {
      lvs: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { positionen: true } } },
      },
    },
  });
  if (!projekt) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-1 text-xs text-slate-500">
        <Link href="/" className="hover:underline">Projekte</Link> / {projekt.nummer}
      </div>
      <h1 className="mb-1 text-xl font-bold">{projekt.bezeichnung}</h1>
      <p className="mb-2 text-sm text-slate-500">
        {projekt.auftraggeber && <>AG: {projekt.auftraggeber} · </>}
        {projekt.ort}
      </p>
      {user.rolle !== "LESER" && (
        <div className="mb-6">
          <ProjektEinstellungen
            projekt={{
              id: projekt.id,
              nummer: projekt.nummer,
              bezeichnung: projekt.bezeichnung,
              auftraggeber: projekt.auftraggeber,
              ort: projekt.ort,
              anzahlLvs: projekt.lvs.length,
            }}
          />
        </div>
      )}

      {user.rolle !== "LESER" && (
      <>
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          Neues Leistungsverzeichnis
        </h2>
        <form
          action={lvAnlegen.bind(null, projekt.id)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Bezeichnung *
            </label>
            <input
              name="bezeichnung"
              required
              placeholder="Baumeisterarbeiten"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              LV-Art
            </label>
            <select
              name="art"
              defaultValue="AUSSCHREIBUNGS_LV"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            >
              {Object.entries(lvArtLabel).map(([wert, label]) => (
                <option key={wert} value={wert}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button className="rounded bg-blue-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-900">
            Anlegen
          </button>
        </form>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          LV aus ÖNORM-Datenträger importieren (.onlv)
        </h2>
        <OnlvImportForm projektId={projekt.id} />
      </div>
      </>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Bezeichnung</th>
              <th className="px-4 py-2">Art</th>
              <th className="px-4 py-2 text-right">Positionen</th>
              <th className="px-4 py-2">Angelegt</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {projekt.lvs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Noch keine Leistungsverzeichnisse vorhanden.
                </td>
              </tr>
            )}
            {projekt.lvs.map((lv) => (
              <tr key={lv.id} className="border-t border-slate-100 hover:bg-blue-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/projekte/${projekt.id}/lv/${lv.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {lv.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{lvArtLabel[lv.art]}</td>
                <td className="px-4 py-2 text-right">{lv._count.positionen}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {lv.createdAt.toLocaleDateString("de-AT")}
                </td>
                <td className="px-4 py-2 text-right">
                  <a
                    href={`/projekte/${projekt.id}/lv/${lv.id}/export`}
                    className="text-xs text-blue-700 hover:underline"
                    title="Als ÖNORM-Datenträger (.onlv) exportieren"
                  >
                    Export .onlv
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
