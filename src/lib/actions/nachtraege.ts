"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";

async function lvDesMandanten(lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    select: { id: true, projektId: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");
  return lv;
}

function ntPfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}/nachtraege`;
}

async function offenerNachtrag(lvId: string, nachtragId: string) {
  const nachtrag = await prisma.nachtrag.findFirst({
    where: { id: nachtragId, lvId },
  });
  if (!nachtrag) throw new Error("Nachtrag nicht gefunden");
  if (nachtrag.status === "BEAUFTRAGT") {
    throw new Error("Beauftragte Nachträge können nicht geändert werden");
  }
  return nachtrag;
}

// ── Nachträge ───────────────────────────────────────────────────────

export async function nachtragAnlegen(lvId: string, bezeichnung: string) {
  const lv = await lvDesMandanten(lvId);
  if (!bezeichnung.trim()) return;
  const max = await prisma.nachtrag.aggregate({
    where: { lvId },
    _max: { nummer: true },
  });
  await prisma.nachtrag.create({
    data: {
      lvId,
      nummer: (max._max.nummer ?? 0) + 1,
      bezeichnung: bezeichnung.trim(),
    },
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

export async function nachtragLoeschen(lvId: string, nachtragId: string) {
  const lv = await lvDesMandanten(lvId);
  await offenerNachtrag(lvId, nachtragId);
  await prisma.nachtrag.delete({ where: { id: nachtragId } });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

export async function nachtragAblehnen(lvId: string, nachtragId: string) {
  const lv = await lvDesMandanten(lvId);
  await prisma.nachtrag.updateMany({
    where: { id: nachtragId, lvId, status: "ANGEBOTEN" },
    data: { status: "ABGELEHNT" },
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

export async function nachtragWiedereroeffnen(lvId: string, nachtragId: string) {
  const lv = await lvDesMandanten(lvId);
  await prisma.nachtrag.updateMany({
    where: { id: nachtragId, lvId, status: "ABGELEHNT" },
    data: { status: "ANGEBOTEN" },
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

/**
 * Beauftragt einen Nachtrag: legt im LV eine eigene Nachtrags-Gruppe an
 * (LG-Ebene, Nummer "NT<n>") und übernimmt die Nachtragspositionen als
 * reguläre LV-Positionen – damit sind sie kalkulier- und abrechenbar.
 */
export async function nachtragBeauftragen(lvId: string, nachtragId: string) {
  const lv = await lvDesMandanten(lvId);
  const nachtrag = await prisma.nachtrag.findFirst({
    where: { id: nachtragId, lvId, status: "ANGEBOTEN" },
    include: { positionen: { orderBy: { sortier: "asc" } } },
  });
  if (!nachtrag) throw new Error("Nachtrag nicht gefunden oder nicht offen");
  if (nachtrag.positionen.length === 0) {
    throw new Error("Der Nachtrag hat keine Positionen");
  }

  await prisma.$transaction(async (tx) => {
    // Status als ERSTE Operation bedingt umsetzen: Bei zwei gleichzeitigen
    // Beauftragungen (zwei Tabs/Nutzer) gewinnt genau eine Transaktion, die
    // zweite findet keinen offenen Nachtrag mehr und bricht ab – sonst
    // würden die Positionen doppelt ins LV übernommen.
    const beauftragt = await tx.nachtrag.updateMany({
      where: { id: nachtragId, lvId, status: "ANGEBOTEN" },
      data: { status: "BEAUFTRAGT", beauftragtAm: new Date() },
    });
    if (beauftragt.count === 0) {
      throw new Error("Nachtrag wurde bereits beauftragt");
    }

    const maxSortier = await tx.lvGruppe.aggregate({
      where: { lvId, parentId: null },
      _max: { sortier: true },
    });
    const gruppe = await tx.lvGruppe.create({
      data: {
        lvId,
        parentId: null,
        ebene: "LG",
        nummer: `NT${nachtrag.nummer}`,
        bezeichnung: `Nachtrag ${nachtrag.nummer}: ${nachtrag.bezeichnung}`,
        sortier: (maxSortier._max.sortier ?? 0) + 1,
      },
    });

    for (const [i, np] of nachtrag.positionen.entries()) {
      const position = await tx.position.create({
        data: {
          lvId,
          gruppeId: gruppe.id,
          nummer: np.nummer,
          stichwort: np.stichwort,
          langtext: np.langtext,
          einheit: np.einheit,
          menge: np.menge,
          art: "NORMAL",
          epLohn: np.epLohn,
          epSonstiges: np.epSonstiges,
          sortier: i + 1,
        },
      });
      await tx.nachtragsPosition.update({
        where: { id: np.id },
        data: { uebernommenePositionId: position.id },
      });
    }
  });

  revalidatePath(ntPfad(lv.projektId, lvId));
  revalidatePath(`/projekte/${lv.projektId}/lv/${lvId}`);
}

// ── Nachtragspositionen ─────────────────────────────────────────────

export interface NtPositionsDaten {
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
  menge: number;
  epLohn: number;
  epSonstiges: number;
}

function endlicheZahl(wert: unknown, feld: string): number {
  if (typeof wert !== "number" || !Number.isFinite(wert)) {
    throw new Error(`Ungültiger Wert für ${feld}`);
  }
  return wert;
}

/**
 * Übernimmt nur die bekannten Felder (Server Actions sind öffentliche
 * Endpunkte – ein Spread der Client-Daten könnte sonst nachtragId oder
 * uebernommenePositionId überschreiben) und validiert die Zahlen.
 */
function ntPositionsDaten(
  daten: Partial<NtPositionsDaten>
): Partial<NtPositionsDaten> {
  const d: Partial<NtPositionsDaten> = {};
  if (daten.nummer !== undefined) d.nummer = String(daten.nummer).trim();
  if (daten.stichwort !== undefined) d.stichwort = String(daten.stichwort).trim();
  if (daten.langtext !== undefined) d.langtext = String(daten.langtext);
  if (daten.einheit !== undefined) d.einheit = String(daten.einheit).trim();
  if (daten.menge !== undefined) d.menge = endlicheZahl(daten.menge, "Menge");
  if (daten.epLohn !== undefined) d.epLohn = endlicheZahl(daten.epLohn, "EP Lohn");
  if (daten.epSonstiges !== undefined) {
    d.epSonstiges = endlicheZahl(daten.epSonstiges, "EP Sonstiges");
  }
  return d;
}

export async function ntPositionAnlegen(
  lvId: string,
  nachtragId: string,
  daten: NtPositionsDaten
) {
  const lv = await lvDesMandanten(lvId);
  await offenerNachtrag(lvId, nachtragId);
  const max = await prisma.nachtragsPosition.aggregate({
    where: { nachtragId },
    _max: { sortier: true },
  });
  await prisma.nachtragsPosition.create({
    data: {
      ...(ntPositionsDaten(daten) as NtPositionsDaten),
      nachtragId,
      sortier: (max._max.sortier ?? 0) + 1,
    },
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

export async function ntPositionAendern(
  lvId: string,
  nachtragId: string,
  positionId: string,
  daten: Partial<NtPositionsDaten>
) {
  const lv = await lvDesMandanten(lvId);
  await offenerNachtrag(lvId, nachtragId);
  await prisma.nachtragsPosition.updateMany({
    where: { id: positionId, nachtragId },
    data: ntPositionsDaten(daten),
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}

export async function ntPositionLoeschen(
  lvId: string,
  nachtragId: string,
  positionId: string
) {
  const lv = await lvDesMandanten(lvId);
  await offenerNachtrag(lvId, nachtragId);
  await prisma.nachtragsPosition.deleteMany({
    where: { id: positionId, nachtragId },
  });
  revalidatePath(ntPfad(lv.projektId, lvId));
}