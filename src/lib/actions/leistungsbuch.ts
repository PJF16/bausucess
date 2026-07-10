"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter, requireUser } from "@/lib/session";

// ── Verwaltung ──────────────────────────────────────────────────────

export async function lbGruppeAnlegen(
  parentId: string | null,
  nummer: string,
  bezeichnung: string
) {
  const user = await requireBearbeiter();
  if (!nummer.trim() || !bezeichnung.trim()) return;
  if (parentId) {
    const parent = await prisma.lbGruppe.findFirst({
      where: { id: parentId, tenantId: user.tenantId },
    });
    if (!parent) throw new Error("Übergeordnete Gruppe nicht gefunden");
  }
  const max = await prisma.lbGruppe.aggregate({
    where: { tenantId: user.tenantId, parentId },
    _max: { sortier: true },
  });
  await prisma.lbGruppe.create({
    data: {
      tenantId: user.tenantId,
      parentId,
      nummer: nummer.trim(),
      bezeichnung: bezeichnung.trim(),
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath("/leistungsbuch");
}

export async function lbGruppeLoeschen(gruppeId: string) {
  const user = await requireBearbeiter();
  await prisma.lbGruppe.deleteMany({
    where: { id: gruppeId, tenantId: user.tenantId },
  });
  revalidatePath("/leistungsbuch");
}

export interface LbPositionsDaten {
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
}

export async function lbPositionAnlegen(
  gruppeId: string,
  daten: LbPositionsDaten
) {
  const user = await requireBearbeiter();
  const gruppe = await prisma.lbGruppe.findFirst({
    where: { id: gruppeId, tenantId: user.tenantId },
  });
  if (!gruppe) throw new Error("Gruppe nicht gefunden");
  const max = await prisma.lbPosition.aggregate({
    where: { gruppeId },
    _max: { sortier: true },
  });
  await prisma.lbPosition.create({
    data: { gruppeId, ...daten, sortier: (max._max.sortier ?? 0) + 1 },
  });
  revalidatePath("/leistungsbuch");
}

export async function lbPositionAendern(
  positionId: string,
  daten: Partial<LbPositionsDaten>
) {
  const user = await requireBearbeiter();
  await prisma.lbPosition.updateMany({
    where: { id: positionId, gruppe: { tenantId: user.tenantId } },
    data: daten,
  });
  revalidatePath("/leistungsbuch");
}

export async function lbPositionLoeschen(positionId: string) {
  const user = await requireBearbeiter();
  await prisma.lbPosition.deleteMany({
    where: { id: positionId, gruppe: { tenantId: user.tenantId } },
  });
  revalidatePath("/leistungsbuch");
}

// ── Suche & Übernahme ins LV ────────────────────────────────────────

export interface LbTreffer {
  id: string;
  nummer: string;
  stichwort: string;
  einheit: string;
  gruppenPfad: string;
}

/** Sucht Stammpositionen für den Übernahme-Dialog im LV-Editor. */
export async function lbSuchen(query: string): Promise<LbTreffer[]> {
  const user = await requireUser();
  const q = query.trim();
  const positionen = await prisma.lbPosition.findMany({
    where: {
      gruppe: { tenantId: user.tenantId },
      ...(q
        ? {
            OR: [
              { stichwort: { contains: q, mode: "insensitive" } },
              { langtext: { contains: q, mode: "insensitive" } },
              { nummer: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { gruppe: { include: { parent: true } } },
    orderBy: [{ gruppe: { nummer: "asc" } }, { sortier: "asc" }],
    take: 30,
  });
  return positionen.map((p) => ({
    id: p.id,
    nummer: p.nummer,
    stichwort: p.stichwort,
    einheit: p.einheit,
    gruppenPfad: p.gruppe.parent
      ? `${p.gruppe.parent.nummer} ${p.gruppe.parent.bezeichnung} › ${p.gruppe.nummer} ${p.gruppe.bezeichnung}`
      : `${p.gruppe.nummer} ${p.gruppe.bezeichnung}`,
  }));
}

/** Übernimmt eine Stammposition als neue Position in eine LV-Gruppe. */
export async function positionAusLbUebernehmen(
  lvId: string,
  gruppeId: string,
  lbPositionId: string
) {
  const user = await requireBearbeiter();
  const [lv, gruppe, lbPosition] = await Promise.all([
    prisma.lv.findFirst({
      where: { id: lvId, projekt: { tenantId: user.tenantId } },
      select: { id: true, projektId: true },
    }),
    prisma.lvGruppe.findFirst({ where: { id: gruppeId, lvId } }),
    prisma.lbPosition.findFirst({
      where: { id: lbPositionId, gruppe: { tenantId: user.tenantId } },
    }),
  ]);
  if (!lv || !gruppe || !lbPosition) {
    throw new Error("LV, Gruppe oder Stammposition nicht gefunden");
  }

  const max = await prisma.position.aggregate({
    where: { gruppeId },
    _max: { sortier: true },
  });
  await prisma.position.create({
    data: {
      lvId,
      gruppeId,
      nummer: lbPosition.nummer,
      stichwort: lbPosition.stichwort,
      langtext: lbPosition.langtext,
      einheit: lbPosition.einheit,
      menge: 0,
      epLohn: 0,
      epSonstiges: 0,
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(`/projekte/${lv.projektId}/lv/${lvId}`);
}