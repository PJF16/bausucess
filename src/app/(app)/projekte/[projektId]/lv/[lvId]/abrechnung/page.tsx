import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { LvTabs } from "@/components/lv-tabs";
import {
  AbrechnungEditor,
  type AbrBlatt,
  type AbrGruppe,
  type AbrPosition,
  type AbrRechnung,
  type AbrZeile,
} from "@/components/abrechnung-editor";

export default async function AbrechnungPage({
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
      aufmassblaetter: {
        orderBy: { nummer: "asc" },
        include: { zeilen: { orderBy: { sortier: "asc" }, include: { rechnung: true } } },
      },
      rechnungen: { orderBy: { nummer: "asc" }, include: { zeilen: true } },
    },
  });
  if (!lv) notFound();

  const gruppen: AbrGruppe[] = lv.gruppen.map((g) => ({
    id: g.id,
    parentId: g.parentId,
    nummer: g.nummer,
    bezeichnung: g.bezeichnung,
  }));

  const epJePosition = new Map(
    lv.positionen.map((p) => [p.id, Number(p.epLohn) + Number(p.epSonstiges)])
  );

  const positionen: AbrPosition[] = lv.positionen.map((p) => ({
    id: p.id,
    gruppeId: p.gruppeId,
    nummer: p.nummer,
    stichwort: p.stichwort,
    einheit: p.einheit,
    mengeSoll: Number(p.menge),
    ep: epJePosition.get(p.id) ?? 0,
  }));

  const blaetter: AbrBlatt[] = lv.aufmassblaetter.map((b) => ({
    id: b.id,
    nummer: b.nummer,
    bezeichnung: b.bezeichnung,
  }));

  const zeilen: AbrZeile[] = lv.aufmassblaetter.flatMap((b) =>
    b.zeilen.map((z) => ({
      id: z.id,
      blattId: z.blattId,
      positionId: z.positionId,
      bezeichnung: z.bezeichnung,
      ansatz: z.ansatz,
      menge: Number(z.menge),
      rechnungNummer: z.rechnung?.nummer ?? null,
    }))
  );

  const rechnungen: AbrRechnung[] = lv.rechnungen.map((r) => ({
    id: r.id,
    nummer: r.nummer,
    art: r.art,
    status: r.status,
    netto: r.zeilen.reduce(
      (acc, z) => acc + Number(z.menge) * (epJePosition.get(z.positionId) ?? 0),
      0
    ),
  }));

  const basisPfad = `/projekte/${lv.projekt.id}/lv/${lv.id}/abrechnung`;

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
          <LvTabs projektId={lv.projekt.id} lvId={lv.id} aktiv="abrechnung" />
        </nav>
      </div>
      <AbrechnungEditor
        lvId={lv.id}
        basisPfad={basisPfad}
        gruppen={gruppen}
        positionen={positionen}
        blaetter={blaetter}
        zeilen={zeilen}
        rechnungen={rechnungen}
        darfBearbeiten={user.rolle !== "LESER"}
      />
    </div>
  );
}
