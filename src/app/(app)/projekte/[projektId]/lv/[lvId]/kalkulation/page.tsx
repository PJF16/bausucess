import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { LvTabs } from "@/components/lv-tabs";
import {
  KalkEditor,
  type KalkGruppe,
  type KalkPosition,
  type KalkAnsatzRow,
} from "@/components/kalk-editor";

export default async function KalkulationPage({
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
      kalkulation: { include: { ansaetze: { orderBy: { sortier: "asc" } } } },
    },
  });
  if (!lv) notFound();

  // Kalkulationsblatt beim ersten Aufruf mit Standardwerten anlegen
  const kalkulation =
    lv.kalkulation ??
    (await prisma.kalkulation.create({
      data: { lvId: lv.id },
      include: { ansaetze: true },
    }));

  const positionen: KalkPosition[] = lv.positionen.map((p) => ({
    id: p.id,
    gruppeId: p.gruppeId,
    nummer: p.nummer,
    stichwort: p.stichwort,
    einheit: p.einheit,
    menge: Number(p.menge),
    epLohn: Number(p.epLohn),
    epSonstiges: Number(p.epSonstiges),
  }));

  const gruppen: KalkGruppe[] = lv.gruppen.map((g) => ({
    id: g.id,
    parentId: g.parentId,
    ebene: g.ebene,
    nummer: g.nummer,
    bezeichnung: g.bezeichnung,
  }));

  const ansaetze: KalkAnsatzRow[] = kalkulation.ansaetze.map((a) => ({
    id: a.id,
    positionId: a.positionId,
    art: a.art,
    bezeichnung: a.bezeichnung,
    menge: Number(a.menge),
    einheit: a.einheit,
    preis: Number(a.preis),
  }));

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
          <LvTabs projektId={lv.projekt.id} lvId={lv.id} aktiv="kalkulation" />
        </nav>
      </div>
      <KalkEditor
        kalkulationId={kalkulation.id}
        params={{
          mittellohnkosten: Number(kalkulation.mittellohnkosten),
          zuschlagLohn: Number(kalkulation.zuschlagLohn),
          zuschlagMaterial: Number(kalkulation.zuschlagMaterial),
          zuschlagGeraet: Number(kalkulation.zuschlagGeraet),
          zuschlagFremd: Number(kalkulation.zuschlagFremd),
          zuschlagSonstiges: Number(kalkulation.zuschlagSonstiges),
        }}
        gruppen={gruppen}
        positionen={positionen}
        ansaetze={ansaetze}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
