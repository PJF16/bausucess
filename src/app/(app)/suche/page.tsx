import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { lvArtLabel } from "@/lib/labels";

export default async function SuchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const q = (await searchParams).q?.trim() ?? "";

  const [projekte, lvs, positionen] = q
    ? await Promise.all([
        prisma.projekt.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { nummer: { contains: q, mode: "insensitive" } },
              { bezeichnung: { contains: q, mode: "insensitive" } },
              { auftraggeber: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 20,
        }),
        prisma.lv.findMany({
          where: {
            projekt: { tenantId: user.tenantId },
            bezeichnung: { contains: q, mode: "insensitive" },
          },
          include: { projekt: { select: { id: true, nummer: true } } },
          take: 20,
        }),
        prisma.position.findMany({
          where: {
            lv: { projekt: { tenantId: user.tenantId } },
            OR: [
              { stichwort: { contains: q, mode: "insensitive" } },
              { langtext: { contains: q, mode: "insensitive" } },
            ],
          },
          include: {
            lv: {
              select: {
                id: true,
                bezeichnung: true,
                projekt: { select: { id: true, nummer: true } },
              },
            },
          },
          take: 50,
        }),
      ])
    : [[], [], []];

  const treffer = projekte.length + lvs.length + positionen.length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-bold">Suche</h1>
      <form action="/suche" className="mb-6 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q}
          autoFocus
          placeholder="Projektnummer, LV, Stichwort, Langtext …"
          className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
        <button className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900">
          Suchen
        </button>
      </form>

      {q && (
        <p className="mb-4 text-sm text-slate-500">
          {treffer} Treffer für „{q}&ldquo;
        </p>
      )}

      {projekte.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Projekte
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {projekte.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projekte/${p.id}`}
                  className="block px-4 py-2 text-sm hover:bg-blue-50"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {p.nummer}
                  </span>{" "}
                  <span className="font-medium">{p.bezeichnung}</span>
                  {p.auftraggeber && (
                    <span className="text-slate-500"> · {p.auftraggeber}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lvs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leistungsverzeichnisse
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {lvs.map((lv) => (
              <li key={lv.id}>
                <Link
                  href={`/projekte/${lv.projekt.id}/lv/${lv.id}`}
                  className="block px-4 py-2 text-sm hover:bg-blue-50"
                >
                  <span className="font-medium">{lv.bezeichnung}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {lvArtLabel[lv.art]} · Projekt {lv.projekt.nummer}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {positionen.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Positionen
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {positionen.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projekte/${p.lv.projekt.id}/lv/${p.lv.id}`}
                  className="block px-4 py-2 text-sm hover:bg-blue-50"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {p.nummer}
                  </span>{" "}
                  <span className="font-medium">{p.stichwort}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {p.lv.bezeichnung} · Projekt {p.lv.projekt.nummer}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q && treffer === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Keine Treffer – versuchen Sie einen anderen Suchbegriff.
        </p>
      )}
    </div>
  );
}
