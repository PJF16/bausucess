"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import type { GruppenEbene, PositionsArt, Prisma } from "@prisma/client";

/** Stellt sicher, dass das LV zum Mandanten des angemeldeten Users gehört. */
async function lvDesMandanten(lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    select: { id: true, projektId: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");
  return lv;
}

function lvPfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}`;
}

// ── Gruppen ─────────────────────────────────────────────────────────

const naechsteEbene: Record<string, GruppenEbene | null> = {
  ROOT: "LG",
  HG: "OG",
  OG: "LG",
  LG: "ULG",
  ULG: null,
};

export async function gruppeAnlegen(
  lvId: string,
  parentId: string | null,
  nummer: string,
  bezeichnung: string
) {
  const lv = await lvDesMandanten(lvId);
  let ebene: GruppenEbene = "LG";
  if (parentId) {
    const parent = await prisma.lvGruppe.findFirst({
      where: { id: parentId, lvId },
    });
    if (!parent) throw new Error("Übergeordnete Gruppe nicht gefunden");
    const next = naechsteEbene[parent.ebene];
    if (!next) throw new Error("Unter einer ULG sind nur Positionen möglich");
    ebene = next;
  }
  const max = await prisma.lvGruppe.aggregate({
    where: { lvId, parentId },
    _max: { sortier: true },
  });
  await prisma.lvGruppe.create({
    data: {
      lvId,
      parentId,
      ebene,
      nummer: nummer.trim(),
      bezeichnung: bezeichnung.trim(),
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

export async function gruppeAendern(
  lvId: string,
  gruppeId: string,
  nummer: string,
  bezeichnung: string
) {
  const lv = await lvDesMandanten(lvId);
  await prisma.lvGruppe.updateMany({
    where: { id: gruppeId, lvId },
    data: { nummer: nummer.trim(), bezeichnung: bezeichnung.trim() },
  });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

export async function gruppeLoeschen(lvId: string, gruppeId: string) {
  const lv = await lvDesMandanten(lvId);

  // Alle Untergruppen einsammeln – das Löschen kaskadiert über die ganze
  // Hierarchie samt Positionen und deren Aufmaßzeilen.
  const alle = await prisma.lvGruppe.findMany({
    where: { lvId },
    select: { id: true, parentId: true },
  });
  if (!alle.some((g) => g.id === gruppeId)) return;
  const betroffen = new Set<string>([gruppeId]);
  let gewachsen = true;
  while (gewachsen) {
    gewachsen = false;
    for (const g of alle) {
      if (g.parentId && betroffen.has(g.parentId) && !betroffen.has(g.id)) {
        betroffen.add(g.id);
        gewachsen = true;
      }
    }
  }
  const gruppenIds = Array.from(betroffen);
  await loeschenVerhindernWennAbgerechnet({ gruppeId: { in: gruppenIds } });

  await prisma.lvGruppe.deleteMany({ where: { id: gruppeId, lvId } });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

/**
 * Verhindert das Löschen von Positionen, an denen Abrechnungs- oder
 * Nachtragsdaten hängen – die Kaskade würde sonst Aufmaß (Beweissicherung!)
 * und Rechnungsinhalte stillschweigend mitlöschen.
 */
async function loeschenVerhindernWennAbgerechnet(
  positionsFilter: Prisma.PositionWhereInput
) {
  const abgerechnet = await prisma.aufmasszeile.count({
    where: { rechnungId: { not: null }, position: positionsFilter },
  });
  if (abgerechnet > 0) {
    throw new Error(
      "Bereits abgerechnete Positionen können nicht gelöscht werden"
    );
  }
  const aufmass = await prisma.aufmasszeile.count({
    where: { position: positionsFilter },
  });
  if (aufmass > 0) {
    throw new Error(
      "An der Position hängen Aufmaßzeilen – bitte zuerst das Aufmaß löschen"
    );
  }
  const nachtrag = await prisma.nachtragsPosition.count({
    where: { uebernommenePosition: positionsFilter },
  });
  if (nachtrag > 0) {
    throw new Error(
      "Positionen aus einem beauftragten Nachtrag können nicht gelöscht werden"
    );
  }
}

// ── Positionen ──────────────────────────────────────────────────────

export interface PositionsDaten {
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
  menge: number;
  art: PositionsArt;
  epLohn: number;
  epSonstiges: number;
}

const POSITIONS_ARTEN: ReadonlySet<string> = new Set([
  "NORMAL",
  "WESENTLICH",
  "EVENTUAL",
  "ALTERNATIV",
  "REGIE",
]);

function endlicheZahl(wert: unknown, feld: string): number {
  if (typeof wert !== "number" || !Number.isFinite(wert)) {
    throw new Error(`Ungültiger Wert für ${feld}`);
  }
  return wert;
}

/**
 * Übernimmt nur die bekannten Positionsfelder (Server Actions sind
 * öffentliche Endpunkte – ein Spread der Client-Daten könnte sonst z. B.
 * lvId oder gruppeId überschreiben) und validiert die Zahlen.
 */
function positionsDaten(daten: Partial<PositionsDaten>): Partial<PositionsDaten> {
  const d: Partial<PositionsDaten> = {};
  if (daten.nummer !== undefined) d.nummer = String(daten.nummer).trim();
  if (daten.stichwort !== undefined) d.stichwort = String(daten.stichwort).trim();
  if (daten.langtext !== undefined) d.langtext = String(daten.langtext);
  if (daten.einheit !== undefined) d.einheit = String(daten.einheit).trim();
  if (daten.menge !== undefined) d.menge = endlicheZahl(daten.menge, "Menge");
  if (daten.epLohn !== undefined) d.epLohn = endlicheZahl(daten.epLohn, "EP Lohn");
  if (daten.epSonstiges !== undefined) {
    d.epSonstiges = endlicheZahl(daten.epSonstiges, "EP Sonstiges");
  }
  if (daten.art !== undefined) {
    if (!POSITIONS_ARTEN.has(daten.art)) throw new Error("Ungültige Positionsart");
    d.art = daten.art;
  }
  return d;
}

export async function positionAnlegen(
  lvId: string,
  gruppeId: string,
  daten: PositionsDaten
) {
  const lv = await lvDesMandanten(lvId);
  const gruppe = await prisma.lvGruppe.findFirst({
    where: { id: gruppeId, lvId },
  });
  if (!gruppe) throw new Error("Gruppe nicht gefunden");
  const max = await prisma.position.aggregate({
    where: { gruppeId },
    _max: { sortier: true },
  });
  await prisma.position.create({
    data: {
      ...(positionsDaten(daten) as PositionsDaten),
      lvId,
      gruppeId,
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

export async function positionAendern(
  lvId: string,
  positionId: string,
  daten: Partial<PositionsDaten>
) {
  const lv = await lvDesMandanten(lvId);
  await prisma.position.updateMany({
    where: { id: positionId, lvId },
    data: positionsDaten(daten),
  });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

export async function positionLoeschen(lvId: string, positionId: string) {
  const lv = await lvDesMandanten(lvId);
  await loeschenVerhindernWennAbgerechnet({ id: positionId, lvId });
  await prisma.position.deleteMany({ where: { id: positionId, lvId } });
  revalidatePath(lvPfad(lv.projektId, lvId));
}

// ── Umsortieren ─────────────────────────────────────────────────────

export type Richtung = "HOCH" | "RUNTER";

/** Tauscht eine Position mit ihrem Nachbarn innerhalb derselben Gruppe. */
export async function positionVerschieben(
  lvId: string,
  positionId: string,
  richtung: Richtung
) {
  const lv = await lvDesMandanten(lvId);
  const position = await prisma.position.findFirst({
    where: { id: positionId, lvId },
  });
  if (!position) throw new Error("Position nicht gefunden");

  const geschwister = await prisma.position.findMany({
    where: { gruppeId: position.gruppeId },
    orderBy: { sortier: "asc" },
    select: { id: true },
  });
  const idx = geschwister.findIndex((p) => p.id === positionId);
  const ziel = richtung === "HOCH" ? idx - 1 : idx + 1;
  if (idx < 0 || ziel < 0 || ziel >= geschwister.length) return;

  [geschwister[idx], geschwister[ziel]] = [geschwister[ziel], geschwister[idx]];
  await prisma.$transaction(
    geschwister.map((p, i) =>
      prisma.position.update({ where: { id: p.id }, data: { sortier: i + 1 } })
    )
  );
  revalidatePath(lvPfad(lv.projektId, lvId));
}

/** Tauscht eine Gruppe mit ihrem Nachbarn auf derselben Ebene. */
export async function gruppeVerschieben(
  lvId: string,
  gruppeId: string,
  richtung: Richtung
) {
  const lv = await lvDesMandanten(lvId);
  const gruppe = await prisma.lvGruppe.findFirst({
    where: { id: gruppeId, lvId },
  });
  if (!gruppe) throw new Error("Gruppe nicht gefunden");

  const geschwister = await prisma.lvGruppe.findMany({
    where: { lvId, parentId: gruppe.parentId },
    orderBy: { sortier: "asc" },
    select: { id: true },
  });
  const idx = geschwister.findIndex((g) => g.id === gruppeId);
  const ziel = richtung === "HOCH" ? idx - 1 : idx + 1;
  if (idx < 0 || ziel < 0 || ziel >= geschwister.length) return;

  [geschwister[idx], geschwister[ziel]] = [geschwister[ziel], geschwister[idx]];
  await prisma.$transaction(
    geschwister.map((g, i) =>
      prisma.lvGruppe.update({ where: { id: g.id }, data: { sortier: i + 1 } })
    )
  );
  revalidatePath(lvPfad(lv.projektId, lvId));
}
