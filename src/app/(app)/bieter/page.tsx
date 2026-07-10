import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { bieterAnlegen, bieterLoeschen } from "@/lib/actions/vergabe";

export default async function BieterPage() {
  const user = await requireUser();
  const bieter = await prisma.bieter.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { firma: "asc" },
    include: { _count: { select: { angebote: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-bold">Bieter</h1>
      <p className="mb-4 text-sm text-slate-500">
        Firmenweite Bieterliste – wird bei Ausschreibungen projektübergreifend
        wiederverwendet.
      </p>

      {user.rolle !== "LESER" && (
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          Neuen Bieter anlegen
        </h2>
        <form action={bieterAnlegen} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Firma *
            </label>
            <input
              name="firma"
              required
              placeholder="Muster Bau GmbH"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Ansprechpartner
            </label>
            <input
              name="ansprechpartner"
              className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              E-Mail
            </label>
            <input
              name="email"
              type="email"
              className="w-48 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Telefon
            </label>
            <input
              name="telefon"
              className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <button className="rounded bg-blue-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-900">
            Anlegen
          </button>
        </form>
      </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Firma</th>
              <th className="px-4 py-2">Ansprechpartner</th>
              <th className="px-4 py-2">E-Mail</th>
              <th className="px-4 py-2">Telefon</th>
              <th className="px-4 py-2 text-right">Angebote</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {bieter.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Noch keine Bieter vorhanden – legen Sie oben den ersten an.
                </td>
              </tr>
            )}
            {bieter.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 hover:bg-blue-50">
                <td className="px-4 py-2 font-medium">{b.firma}</td>
                <td className="px-4 py-2 text-slate-500">{b.ansprechpartner ?? "–"}</td>
                <td className="px-4 py-2 text-slate-500">{b.email ?? "–"}</td>
                <td className="px-4 py-2 text-slate-500">{b.telefon ?? "–"}</td>
                <td className="px-4 py-2 text-right">{b._count.angebote}</td>
                <td className="px-4 py-2 text-right">
                  {user.rolle !== "LESER" && (
                    <form action={bieterLoeschen.bind(null, b.id)}>
                      <button
                        className="text-xs text-slate-400 hover:text-red-600"
                        title="Bieter löschen"
                      >
                        Löschen
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
