"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import { ansatzAuswerten } from "@/lib/aufmass";
import type { RechnungArt, RechnungStatus } from "@prisma/client";

async function lvDesMandanten(lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    select: { id: true, projektId: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");
  return lv;
}

function abrechnungPfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}/abrechnung`;
}

// ── Aufmaßblätter ────────────────────────────────────────────────────

export async function blattAnlegen(lvId: string, bezeichnung: string) {
  const lv = await lvDesMandanten(lvId);
  if (!bezeichnung.trim()) return;
  const max = await prisma.aufmassblatt.aggregate({
    where: { lvId },
    _max: { nummer: true },
  });
  await prisma.aufmassblatt.create({
    data: {
      lvId,
      nummer: (max._max.nummer ?? 0) + 1,
      bezeichnung: bezeichnung.trim(),
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function blattLoeschen(lvId: string, blattId: string) {
  const lv = await lvDesMandanten(lvId);
  const abgerechnet = await prisma.aufmasszeile.count({
    where: { blattId, blatt: { lvId }, rechnungId: { not: null } },
  });
  if (abgerechnet > 0) {
    throw new Error(
      "Blatt enthält bereits abgerechnete Zeilen und kann nicht gelöscht werden"
    );
  }
  await prisma.aufmassblatt.deleteMany({ where: { id: blattId, lvId } });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

// ── Aufmaßzeilen ─────────────────────────────────────────────────────

export interface AufmasszeileDaten {
  bezeichnung: string;
  ansatz: string;
  menge: number;
}

/** Menge aus dem Ansatz berechnen, sofern einer angegeben ist. */
function effektiveMenge(daten: AufmasszeileDaten): number {
  if (daten.ansatz.trim()) {
    const berechnet = ansatzAuswerten(daten.ansatz);
    if (berechnet !== null) return berechnet;
  }
  return daten.menge;
}

export async function zeileAnlegen(
  lvId: string,
  blattId: string,
  positionId: string,
  daten: AufmasszeileDaten
) {
  const lv = await lvDesMandanten(lvId);
  const blatt = await prisma.aufmassblatt.findFirst({
    where: { id: blattId, lvId },
  });
  const position = await prisma.position.findFirst({
    where: { id: positionId, lvId },
  });
  if (!blatt || !position) throw new Error("Blatt oder Position nicht gefunden");

  const max = await prisma.aufmasszeile.aggregate({
    where: { blattId },
    _max: { sortier: true },
  });
  await prisma.aufmasszeile.create({
    data: {
      blattId,
      positionId,
      bezeichnung: daten.bezeichnung.trim(),
      ansatz: daten.ansatz.trim(),
      menge: effektiveMenge(daten),
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function zeileAendern(
  lvId: string,
  zeileId: string,
  daten: AufmasszeileDaten
) {
  const lv = await lvDesMandanten(lvId);
  const zeile = await prisma.aufmasszeile.findFirst({
    where: { id: zeileId, blatt: { lvId } },
  });
  if (!zeile) throw new Error("Aufmaßzeile nicht gefunden");
  if (zeile.rechnungId) {
    throw new Error("Zeile ist bereits abgerechnet und kann nicht geändert werden");
  }
  await prisma.aufmasszeile.update({
    where: { id: zeileId },
    data: {
      bezeichnung: daten.bezeichnung.trim(),
      ansatz: daten.ansatz.trim(),
      menge: effektiveMenge(daten),
    },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

export async function zeileLoeschen(lvId: string, zeileId: string) {
  const lv = await lvDesMandanten(lvId);
  await prisma.aufmasszeile.deleteMany({
    where: { id: zeileId, blatt: { lvId }, rechnungId: null },
  });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

// ── Rechnungen ───────────────────────────────────────────────────────

/**
 * Erstellt eine Rechnung und ordnet ihr alle noch nicht abgerechneten
 * Aufmaßzeilen des LV zu (inkrementelle Abrechnung).
 */
export async function rechnungErstellen(lvId: string, art: RechnungArt) {
  const lv = await lvDesMandanten(lvId);

  const offene = await prisma.aufmasszeile.findMany({
    where: { blatt: { lvId }, rechnungId: null },
    select: { id: true },
  });
  if (offene.length === 0) {
    throw new Error("Keine offenen Aufmaßzeilen vorhanden");
  }

  const rechnungId = await prisma.$transaction(async (tx) => {
    const max = await tx.rechnung.aggregate({
      where: { lvId },
      _max: { nummer: true },
    });
    const rechnung = await tx.rechnung.create({
      data: { lvId, nummer: (max._max.nummer ?? 0) + 1, art },
    });
    await tx.aufmasszeile.updateMany({
      where: { id: { in: offene.map((z) => z.id) } },
      data: { rechnungId: rechnung.id },
    });
    return rechnung.id;
  });

  revalidatePath(abrechnungPfad(lv.projektId, lvId));
  redirect(`${abrechnungPfad(lv.projektId, lvId)}/rechnungen/${rechnungId}`);
}

export async function rechnungStatusSetzen(
  lvId: string,
  rechnungId: string,
  status: RechnungStatus
) {
  const lv = await lvDesMandanten(lvId);
  await prisma.rechnung.updateMany({
    where: { id: rechnungId, lvId },
    data: { status },
  });
  revalidatePath(`${abrechnungPfad(lv.projektId, lvId)}/rechnungen/${rechnungId}`);
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
}

/** Löscht eine Rechnung (nur im Entwurf); die Aufmaßzeilen werden wieder offen. */
export async function rechnungLoeschen(lvId: string, rechnungId: string) {
  const lv = await lvDesMandanten(lvId);
  const rechnung = await prisma.rechnung.findFirst({
    where: { id: rechnungId, lvId },
  });
  if (!rechnung) return;
  if (rechnung.status !== "ENTWURF") {
    throw new Error("Nur Rechnungen im Entwurf können gelöscht werden");
  }
  await prisma.rechnung.delete({ where: { id: rechnungId } });
  revalidatePath(abrechnungPfad(lv.projektId, lvId));
  redirect(abrechnungPfad(lv.projektId, lvId));
}
