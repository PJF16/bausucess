"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import { positionsEp, type KalkParams } from "@/lib/kalk";
import type { AnsatzArt } from "@prisma/client";

async function kalkulationDesMandanten(kalkulationId: string) {
  const user = await requireBearbeiter();
  const kalk = await prisma.kalkulation.findFirst({
    where: { id: kalkulationId, lv: { projekt: { tenantId: user.tenantId } } },
    include: { lv: { select: { id: true, projektId: true } } },
  });
  if (!kalk) throw new Error("Kalkulation nicht gefunden");
  return kalk;
}

function kalkPfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}/kalkulation`;
}

export async function kalkParamsAendern(
  kalkulationId: string,
  params: KalkParams
) {
  const kalk = await kalkulationDesMandanten(kalkulationId);
  await prisma.kalkulation.update({
    where: { id: kalk.id },
    data: {
      mittellohnkosten: params.mittellohnkosten,
      zuschlagLohn: params.zuschlagLohn,
      zuschlagMaterial: params.zuschlagMaterial,
      zuschlagGeraet: params.zuschlagGeraet,
      zuschlagFremd: params.zuschlagFremd,
      zuschlagSonstiges: params.zuschlagSonstiges,
    },
  });
  revalidatePath(kalkPfad(kalk.lv.projektId, kalk.lv.id));
}

export interface AnsatzDaten {
  art: AnsatzArt;
  bezeichnung: string;
  menge: number;
  einheit: string;
  preis: number;
}

export async function ansatzAnlegen(
  kalkulationId: string,
  positionId: string,
  daten: AnsatzDaten
) {
  const kalk = await kalkulationDesMandanten(kalkulationId);
  const position = await prisma.position.findFirst({
    where: { id: positionId, lvId: kalk.lv.id },
  });
  if (!position) throw new Error("Position nicht gefunden");
  const max = await prisma.kalkAnsatz.aggregate({
    where: { positionId },
    _max: { sortier: true },
  });
  await prisma.kalkAnsatz.create({
    data: {
      kalkulationId: kalk.id,
      positionId,
      ...daten,
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(kalkPfad(kalk.lv.projektId, kalk.lv.id));
}

export async function ansatzAendern(
  kalkulationId: string,
  ansatzId: string,
  daten: Partial<AnsatzDaten>
) {
  const kalk = await kalkulationDesMandanten(kalkulationId);
  await prisma.kalkAnsatz.updateMany({
    where: { id: ansatzId, kalkulationId: kalk.id },
    data: daten,
  });
  revalidatePath(kalkPfad(kalk.lv.projektId, kalk.lv.id));
}

export async function ansatzLoeschen(kalkulationId: string, ansatzId: string) {
  const kalk = await kalkulationDesMandanten(kalkulationId);
  await prisma.kalkAnsatz.deleteMany({
    where: { id: ansatzId, kalkulationId: kalk.id },
  });
  revalidatePath(kalkPfad(kalk.lv.projektId, kalk.lv.id));
}

/**
 * Übernimmt die kalkulierten Einheitspreise ins LV.
 * Ohne positionId werden alle Positionen mit Ansätzen übernommen.
 */
export async function preiseUebernehmen(
  kalkulationId: string,
  positionId?: string
) {
  const kalk = await kalkulationDesMandanten(kalkulationId);
  const params: KalkParams = {
    mittellohnkosten: Number(kalk.mittellohnkosten),
    zuschlagLohn: Number(kalk.zuschlagLohn),
    zuschlagMaterial: Number(kalk.zuschlagMaterial),
    zuschlagGeraet: Number(kalk.zuschlagGeraet),
    zuschlagFremd: Number(kalk.zuschlagFremd),
    zuschlagSonstiges: Number(kalk.zuschlagSonstiges),
  };

  const ansaetze = await prisma.kalkAnsatz.findMany({
    where: {
      kalkulationId: kalk.id,
      ...(positionId ? { positionId } : {}),
    },
  });

  const jePosition = new Map<string, typeof ansaetze>();
  for (const a of ansaetze) {
    const liste = jePosition.get(a.positionId) ?? [];
    liste.push(a);
    jePosition.set(a.positionId, liste);
  }

  await prisma.$transaction(
    Array.from(jePosition.entries()).map(([posId, liste]) => {
      const ep = positionsEp(
        liste.map((a) => ({
          art: a.art,
          menge: Number(a.menge),
          preis: Number(a.preis),
        })),
        params
      );
      return prisma.position.update({
        where: { id: posId },
        data: { epLohn: ep.epLohn, epSonstiges: ep.epSonstiges },
      });
    })
  );

  revalidatePath(kalkPfad(kalk.lv.projektId, kalk.lv.id));
  revalidatePath(`/projekte/${kalk.lv.projektId}/lv/${kalk.lv.id}`);
}
