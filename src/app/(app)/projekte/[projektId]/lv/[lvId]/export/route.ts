import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { lvZuOnlvXml, type OnlvGruppe } from "@/lib/onlv";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projektId: string; lvId: string }> }
) {
  const user = await requireUser();

  const { projektId, lvId } = await params;
  const lv = await prisma.lv.findFirst({
    where: {
      id: lvId,
      projekt: { id: projektId, tenantId: user.tenantId },
    },
    include: {
      projekt: true,
      gruppen: { orderBy: { sortier: "asc" } },
      positionen: { orderBy: { sortier: "asc" } },
    },
  });
  if (!lv) {
    return NextResponse.json({ error: "LV nicht gefunden" }, { status: 404 });
  }

  // Gruppenbaum aufbauen, Positionen einhängen
  const knoten = new Map<string, OnlvGruppe & { id: string }>();
  for (const g of lv.gruppen) {
    knoten.set(g.id, {
      id: g.id,
      ebene: g.ebene,
      nummer: g.nummer,
      bezeichnung: g.bezeichnung,
      gruppen: [],
      positionen: [],
    });
  }
  const wurzeln: OnlvGruppe[] = [];
  for (const g of lv.gruppen) {
    const node = knoten.get(g.id)!;
    if (g.parentId && knoten.has(g.parentId)) {
      knoten.get(g.parentId)!.gruppen.push(node);
    } else {
      wurzeln.push(node);
    }
  }
  for (const p of lv.positionen) {
    knoten.get(p.gruppeId)?.positionen.push({
      nummer: p.nummer,
      stichwort: p.stichwort,
      langtext: p.langtext,
      einheit: p.einheit,
      menge: Number(p.menge),
      art: p.art,
      epLohn: Number(p.epLohn),
      epSonstiges: Number(p.epSonstiges),
    });
  }

  const xml = lvZuOnlvXml(
    {
      bezeichnung: lv.bezeichnung,
      art: lv.art,
      waehrung: lv.waehrung,
      ustSatz: Number(lv.ustSatz),
      gruppen: wurzeln,
    },
    new Date().toISOString()
  );

  const dateiname = `${lv.projekt.nummer}_${lv.bezeichnung}`
    .replace(/[^\wäöüÄÖÜß-]+/g, "_")
    .slice(0, 80);

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dateiname}.onlv"`,
    },
  });
}
