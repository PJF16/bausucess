import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  LbEditor,
  type LbGruppeRow,
  type LbPositionRow,
} from "@/components/lb-editor";

export default async function LeistungsbuchPage() {
  const user = await requireUser();

  const [gruppen, positionen] = await Promise.all([
    prisma.lbGruppe.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { sortier: "asc" },
    }),
    prisma.lbPosition.findMany({
      where: { gruppe: { tenantId: user.tenantId } },
      orderBy: { sortier: "asc" },
    }),
  ]);

  const gruppenRows: LbGruppeRow[] = gruppen.map((g) => ({
    id: g.id,
    parentId: g.parentId,
    nummer: g.nummer,
    bezeichnung: g.bezeichnung,
  }));
  const positionsRows: LbPositionRow[] = positionen.map((p) => ({
    id: p.id,
    gruppeId: p.gruppeId,
    nummer: p.nummer,
    stichwort: p.stichwort,
    langtext: p.langtext,
    einheit: p.einheit,
  }));

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-sm font-semibold">Leistungsbuch</span>
        <span className="ml-2 text-xs text-slate-500">
          Firmenweiter Stammpositionen-Katalog – Positionen lassen sich im
          LV-Editor über „+ aus Leistungsbuch&ldquo; übernehmen.
        </span>
      </div>
      <LbEditor
        gruppen={gruppenRows}
        positionen={positionsRows}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
