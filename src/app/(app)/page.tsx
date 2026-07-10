import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { projektAnlegen } from "@/lib/actions/projekte";

export default async function DashboardPage() {
  const user = await requireUser();
  const projekte = await prisma.projekt.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { lvs: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-xl font-bold">Projekte</h1>

      {user.rolle !== "LESER" && (
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          Neues Projekt anlegen
        </h2>
        <form action={projektAnlegen} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Projektnummer *
            </label>
            <input
              name="nummer"
              required
              placeholder="2026-001"
              className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Bezeichnung *
            </label>
            <input
              name="bezeichnung"
              required
              placeholder="Wohnanlage Musterstraße"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Auftraggeber
            </label>
            <input
              name="auftraggeber"
              className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Ort
            </label>
            <input
              name="ort"
              className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
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
              <th className="px-4 py-2">Nummer</th>
              <th className="px-4 py-2">Bezeichnung</th>
              <th className="px-4 py-2">Auftraggeber</th>
              <th className="px-4 py-2">Ort</th>
              <th className="px-4 py-2 text-right">LVs</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {projekte.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Noch keine Projekte vorhanden – legen Sie oben das erste an.
                </td>
              </tr>
            )}
            {projekte.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-blue-50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/projekte/${p.id}`} className="text-blue-700 hover:underline">
                    {p.nummer}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/projekte/${p.id}`} className="hover:underline">
                    {p.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{p.auftraggeber ?? "–"}</td>
                <td className="px-4 py-2 text-slate-500">{p.ort ?? "–"}</td>
                <td className="px-4 py-2 text-right">{p._count.lvs}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
