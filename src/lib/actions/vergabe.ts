"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import type { AngebotStatus } from "@prisma/client";

// ── Bieter (mandantenweit) ───────────────────────────────────────────

export async function bieterAnlegen(formData: FormData) {
  const user = await requireBearbeiter();
  const firma = String(formData.get("firma") ?? "").trim();
  if (!firma) return;

  await prisma.bieter.create({
    data: {
      tenantId: user.tenantId,
      firma,
      ansprechpartner: String(formData.get("ansprechpartner") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      telefon: String(formData.get("telefon") ?? "").trim() || null,
      adresse: String(formData.get("adresse") ?? "").trim() || null,
    },
  });
  revalidatePath("/bieter");
}

export async function bieterLoeschen(bieterId: string) {
  const user = await requireBearbeiter();
  await prisma.bieter.deleteMany({
    where: { id: bieterId, tenantId: user.tenantId },
  });
  revalidatePath("/bieter");
}

// ── Angebote je LV ────────────────────────────────────────────────────

async function lvDesMandanten(lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    select: { id: true, projektId: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");
  return { lv, tenantId: user.tenantId };
}

function vergabePfad(projektId: string, lvId: string) {
  return `/projekte/${projektId}/lv/${lvId}/vergabe`;
}

export async function bieterEinladen(lvId: string, bieterId: string) {
  const { lv, tenantId } = await lvDesMandanten(lvId);
  const bieter = await prisma.bieter.findFirst({
    where: { id: bieterId, tenantId },
  });
  if (!bieter) throw new Error("Bieter nicht gefunden");

  await prisma.angebot.upsert({
    where: { lvId_bieterId: { lvId, bieterId } },
    update: {},
    create: { lvId, bieterId },
  });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function angebotEntfernen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.angebot.deleteMany({ where: { id: angebotId, lvId } });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function angebotStatusSetzen(
  lvId: string,
  angebotId: string,
  status: AngebotStatus
) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.angebot.updateMany({
    where: { id: angebotId, lvId },
    data: { status },
  });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function angebotspreisAendern(
  lvId: string,
  angebotId: string,
  positionId: string,
  ep: number
) {
  const { lv } = await lvDesMandanten(lvId);
  const angebot = await prisma.angebot.findFirst({
    where: { id: angebotId, lvId },
  });
  if (!angebot) throw new Error("Angebot nicht gefunden");

  await prisma.angebotsPosition.upsert({
    where: { angebotId_positionId: { angebotId, positionId } },
    update: { ep },
    create: { angebotId, positionId, ep },
  });
  // Erster erfasster Preis: Bieter gilt automatisch als "hat abgegeben"
  if (angebot.status === "EINGELADEN") {
    await prisma.angebot.update({
      where: { id: angebotId },
      data: { status: "ABGEGEBEN" },
    });
  }
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

/** Erteilt den Zuschlag an ein Angebot; ein zuvor erteilter Zuschlag im selben LV wird zurückgesetzt. */
export async function zuschlagErteilen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.$transaction([
    prisma.angebot.updateMany({
      where: { lvId, status: "ZUSCHLAG" },
      data: { status: "ABGEGEBEN" },
    }),
    prisma.angebot.update({
      where: { id: angebotId },
      data: { status: "ZUSCHLAG" },
    }),
  ]);
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function zuschlagZurueckziehen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.angebot.updateMany({
    where: { id: angebotId, lvId, status: "ZUSCHLAG" },
    data: { status: "ABGEGEBEN" },
  });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

/**
 * Erstellt aus dem bezuschlagten Angebot ein neues Vertrags-LV: gleiche
 * Gruppen-/Positionsstruktur, aber mit den Preisen des Bieters. Der
 * Lohn/Sonstiges-Split wird proportional zum Ausschreibungs-LV übernommen,
 * damit z. B. eine spätere Lohngleitung weiter funktioniert.
 */
export async function vertragsLvErzeugen(lvId: string, angebotId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { tenantId: user.tenantId } },
    include: { gruppen: true, positionen: true },
  });
  if (!lv) throw new Error("LV nicht gefunden");

  const angebot = await prisma.angebot.findFirst({
    where: { id: angebotId, lvId },
    include: { bieter: true, preise: true },
  });
  if (!angebot) throw new Error("Angebot nicht gefunden");

  const preisJePosition = new Map(angebot.preise.map((p) => [p.positionId, Number(p.ep)]));

  const neuesLvId = await prisma.$transaction(async (tx) => {
    const neuesLv = await tx.lv.create({
      data: {
        projektId: lv.projektId,
        bezeichnung: `${lv.bezeichnung} (Vertrag – ${angebot.bieter.firma})`,
        art: "VERTRAGS_LV",
        waehrung: lv.waehrung,
        ustSatz: lv.ustSatz,
      },
    });

    const idMap = new Map<string, string>(); // alte Gruppen-ID -> neue Gruppen-ID
    const rest = [...lv.gruppen];
    while (rest.length) {
      let fortschritt = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        const g = rest[i];
        if (g.parentId && !idMap.has(g.parentId)) continue;
        const neu = await tx.lvGruppe.create({
          data: {
            lvId: neuesLv.id,
            parentId: g.parentId ? idMap.get(g.parentId) : null,
            ebene: g.ebene,
            nummer: g.nummer,
            bezeichnung: g.bezeichnung,
            sortier: g.sortier,
          },
        });
        idMap.set(g.id, neu.id);
        rest.splice(i, 1);
        fortschritt = true;
      }
      if (!fortschritt) break; // Sicherheitsnetz gegen kaputte Elternverweise
    }

    for (const p of lv.positionen) {
      const bidEp = preisJePosition.get(p.id);
      let epLohn = Number(p.epLohn);
      let epSonstiges = Number(p.epSonstiges);
      if (bidEp !== undefined) {
        const lvEp = epLohn + epSonstiges;
        const lohnAnteil = lvEp > 0 ? epLohn / lvEp : 0;
        epLohn = Math.round(bidEp * lohnAnteil * 100) / 100;
        epSonstiges = Math.round((bidEp - epLohn) * 100) / 100;
      }
      const gruppeId = idMap.get(p.gruppeId);
      if (!gruppeId) continue; // sollte nach obiger Schleife nicht vorkommen
      await tx.position.create({
        data: {
          lvId: neuesLv.id,
          gruppeId,
          nummer: p.nummer,
          stichwort: p.stichwort,
          langtext: p.langtext,
          einheit: p.einheit,
          menge: p.menge,
          art: p.art,
          epLohn,
          epSonstiges,
          sortier: p.sortier,
        },
      });
    }

    return neuesLv.id;
  });

  revalidatePath(`/projekte/${lv.projektId}`);
  redirect(`/projekte/${lv.projektId}/lv/${neuesLvId}`);
}
