import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { LvTabs } from "@/components/lv-tabs";
import {
  VergabeEditor,
  type VergabeGruppe,
  type VergabePosition,
  type VergabeAngebot,
} from "@/components/vergabe-editor";

export default async function VergabePage({
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
      gruppen: { orderBy: [{ sortier: "asc" }] },
      positionen: { orderBy: [{ sortier: "asc" }] },
      angebote: {
        orderBy: { createdAt: "asc" },
        include: { bieter: true, preise: true },
      },
    },
  });
  if (!lv) notFound();

  const alleBieter = await prisma.bieter.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { firma: "asc" },
  });

  const gruppen: VergabeGruppe[] = lv.gruppen.map((g) => ({
    id: g.id,
    parentId: g.parentId,
    ebene: g.ebene,
    nummer: g.nummer,
    bezeichnung: g.bezeichnung,
  }));

  const positionen: VergabePosition[] = lv.positionen.map((p) => ({
    id: p.id,
    gruppeId: p.gruppeId,
    nummer: p.nummer,
    stichwort: p.stichwort,
    einheit: p.einheit,
    menge: Number(p.menge),
    art: p.art,
    epEigen: Number(p.epLohn) + Number(p.epSonstiges),
  }));

  const angebote: VergabeAngebot[] = lv.angebote.map((a) => ({
    id: a.id,
    bieterId: a.bieterId,
    firma: a.bieter.firma,
    status: a.status,
    preise: Object.fromEntries(a.preise.map((p) => [p.positionId, Number(p.ep)])),
  }));

  const eingeladeneBieterIds = new Set(lv.angebote.map((a) => a.bieterId));
  const verfuegbareBieter = alleBieter
    .filter((b) => !eingeladeneBieterIds.has(b.id))
    .map((b) => ({ id: b.id, firma: b.firma }));

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="text-xs text-slate-500">
          <Link href="/" className="hover:underline">Projekte</Link>
          {" / "}
          <Link href={`/projekte/${lv.projekt.id}`} className="hover:underline">
            {lv.projekt.nummer} {lv.projekt.bezeichnung}
          </Link>
          {" / "}
          <span className="font-medium text-slate-700">{lv.bezeichnung}</span>
        </div>
        <nav className="flex gap-1 text-xs">
          <LvTabs projektId={lv.projekt.id} lvId={lv.id} aktiv="vergabe" />
          <a
            href={`/projekte/${lv.projekt.id}/lv/${lv.id}/vergabe/export`}
            className="rounded border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100"
            title="Preisspiegel als Excel-Datei herunterladen"
          >
            ⬇ Excel
          </a>
        </nav>
      </div>
      <VergabeEditor
        lvId={lv.id}
        gruppen={gruppen}
        positionen={positionen}
        angebote={angebote}
        verfuegbareBieter={verfuegbareBieter}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
