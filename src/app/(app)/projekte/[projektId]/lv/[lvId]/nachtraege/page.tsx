import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { LvTabs } from "@/components/lv-tabs";
import {
  NachtragEditor,
  type NachtragDaten,
} from "@/components/nachtrag-editor";

export default async function NachtraegePage({
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
      nachtraege: {
        orderBy: { nummer: "asc" },
        include: { positionen: { orderBy: { sortier: "asc" } } },
      },
    },
  });
  if (!lv) notFound();

  const nachtraege: NachtragDaten[] = lv.nachtraege.map((n) => ({
    id: n.id,
    nummer: n.nummer,
    bezeichnung: n.bezeichnung,
    status: n.status,
    beauftragtAm: n.beauftragtAm
      ? n.beauftragtAm.toLocaleDateString("de-AT")
      : null,
    positionen: n.positionen.map((p) => ({
      id: p.id,
      nummer: p.nummer,
      stichwort: p.stichwort,
      langtext: p.langtext,
      einheit: p.einheit,
      menge: Number(p.menge),
      epLohn: Number(p.epLohn),
      epSonstiges: Number(p.epSonstiges),
    })),
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
          <LvTabs projektId={lv.projekt.id} lvId={lv.id} aktiv="nachtraege" />
        </nav>
      </div>
      <NachtragEditor
        lvId={lv.id}
        nachtraege={nachtraege}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
