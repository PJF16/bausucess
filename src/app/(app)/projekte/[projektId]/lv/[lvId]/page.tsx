import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { LvEditor, type GruppeNode, type PositionRow } from "@/components/lv-editor";
import { LvEinstellungen } from "@/components/lv-einstellungen";
import { LvTabs } from "@/components/lv-tabs";

export default async function LvPage({
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
    },
  });
  if (!lv) notFound();

  // Baum aufbauen und Decimal-Werte für den Client serialisieren
  const positionen: PositionRow[] = lv.positionen.map((p) => ({
    id: p.id,
    gruppeId: p.gruppeId,
    nummer: p.nummer,
    stichwort: p.stichwort,
    langtext: p.langtext,
    einheit: p.einheit,
    menge: Number(p.menge),
    art: p.art,
    epLohn: Number(p.epLohn),
    epSonstiges: Number(p.epSonstiges),
  }));

  const nodes = new Map<string, GruppeNode>();
  for (const g of lv.gruppen) {
    nodes.set(g.id, {
      id: g.id,
      parentId: g.parentId,
      ebene: g.ebene,
      nummer: g.nummer,
      bezeichnung: g.bezeichnung,
      kinder: [],
    });
  }
  const wurzeln: GruppeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.kinder.push(node);
    } else {
      wurzeln.push(node);
    }
  }

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
          <LvTabs projektId={lv.projekt.id} lvId={lv.id} aktiv="positionen" />
          <a
            href={`/projekte/${lv.projekt.id}/lv/${lv.id}/export`}
            className="rounded border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100"
            title="Als ÖNORM-Datenträger (.onlv) exportieren"
          >
            ⬇ .onlv
          </a>
          <Link
            href={`/projekte/${lv.projekt.id}/lv/${lv.id}/druck`}
            className="rounded border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100"
            title="Druckansicht (PDF über den Browser-Druckdialog)"
          >
            🖨 Druck
          </Link>
          {user.rolle !== "LESER" && (
            <LvEinstellungen
              lv={{
                projektId: lv.projekt.id,
                lvId: lv.id,
                bezeichnung: lv.bezeichnung,
                art: lv.art,
                ustSatz: Number(lv.ustSatz),
                deckungsruecklass: Number(lv.deckungsruecklass),
                haftruecklass: Number(lv.haftruecklass),
                skonto: Number(lv.skonto),
                skontoTage: lv.skontoTage,
                anzahlPositionen: lv.positionen.length,
              }}
            />
          )}
        </nav>
      </div>
      <LvEditor
        lvId={lv.id}
        ustSatz={Number(lv.ustSatz)}
        gruppen={wurzeln}
        positionen={positionen}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
