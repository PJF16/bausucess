"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import type { LvArt } from "@prisma/client";

export async function projektAnlegen(formData: FormData) {
  const user = await requireBearbeiter();
  const nummer = String(formData.get("nummer") ?? "").trim();
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const auftraggeber = String(formData.get("auftraggeber") ?? "").trim();
  const ort = String(formData.get("ort") ?? "").trim();
  if (!nummer || !bezeichnung) return;

  const projekt = await prisma.projekt.create({
    data: {
      tenantId: user.tenantId,
      nummer,
      bezeichnung,
      auftraggeber: auftraggeber || null,
      ort: ort || null,
    },
  });
  revalidatePath("/");
  redirect(`/projekte/${projekt.id}`);
}

export async function projektAendern(projektId: string, formData: FormData) {
  const user = await requireBearbeiter();
  const nummer = String(formData.get("nummer") ?? "").trim();
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  if (!nummer || !bezeichnung) return;

  await prisma.projekt.updateMany({
    where: { id: projektId, tenantId: user.tenantId },
    data: {
      nummer,
      bezeichnung,
      auftraggeber: String(formData.get("auftraggeber") ?? "").trim() || null,
      ort: String(formData.get("ort") ?? "").trim() || null,
    },
  });
  revalidatePath("/");
  revalidatePath(`/projekte/${projektId}`);
}

export async function projektLoeschen(projektId: string) {
  const user = await requireBearbeiter();
  // Gelegte/bezahlte Rechnungen sind Belege – ein Projekt mit solchen
  // Rechnungen darf nicht per Kaskade verschwinden.
  const belege = await prisma.rechnung.count({
    where: {
      status: { not: "ENTWURF" },
      lv: { projekt: { id: projektId, tenantId: user.tenantId } },
    },
  });
  if (belege > 0) {
    throw new Error(
      "Das Projekt enthält gelegte Rechnungen und kann nicht gelöscht werden – bitte stattdessen archivieren"
    );
  }
  await prisma.projekt.deleteMany({
    where: { id: projektId, tenantId: user.tenantId },
  });
  revalidatePath("/");
  redirect("/");
}

export async function lvAnlegen(projektId: string, formData: FormData) {
  const user = await requireBearbeiter();
  const projekt = await prisma.projekt.findFirst({
    where: { id: projektId, tenantId: user.tenantId },
  });
  if (!projekt) return;

  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const art = String(formData.get("art") ?? "AUSSCHREIBUNGS_LV") as LvArt;
  if (!bezeichnung) return;

  const lv = await prisma.lv.create({
    data: { projektId, bezeichnung, art },
  });
  revalidatePath(`/projekte/${projektId}`);
  redirect(`/projekte/${projektId}/lv/${lv.id}`);
}

export async function lvLoeschen(projektId: string, lvId: string) {
  const user = await requireBearbeiter();
  const belege = await prisma.rechnung.count({
    where: {
      lvId,
      status: { not: "ENTWURF" },
      lv: { projekt: { id: projektId, tenantId: user.tenantId } },
    },
  });
  if (belege > 0) {
    throw new Error(
      "Das LV enthält gelegte Rechnungen und kann nicht gelöscht werden"
    );
  }
  await prisma.lv.deleteMany({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
  });
  revalidatePath(`/projekte/${projektId}`);
  redirect(`/projekte/${projektId}`);
}

export async function lvAendern(
  projektId: string,
  lvId: string,
  formData: FormData
) {
  const user = await requireBearbeiter();
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const art = String(formData.get("art") ?? "") as LvArt;
  const ustSatz = Number(formData.get("ustSatz") ?? 20);
  const deckungsruecklass = Number(formData.get("deckungsruecklass") ?? 0);
  const haftruecklass = Number(formData.get("haftruecklass") ?? 0);
  const skonto = Number(formData.get("skonto") ?? 0);
  const skontoTage = Math.round(Number(formData.get("skontoTage") ?? 0));
  if (!bezeichnung || !Number.isFinite(ustSatz)) return;

  await prisma.lv.updateMany({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    data: {
      bezeichnung,
      art,
      ustSatz,
      deckungsruecklass: Number.isFinite(deckungsruecklass) ? deckungsruecklass : 0,
      haftruecklass: Number.isFinite(haftruecklass) ? haftruecklass : 0,
      skonto: Number.isFinite(skonto) ? skonto : 0,
      skontoTage: Number.isFinite(skontoTage) ? skontoTage : 0,
    },
  });
  revalidatePath(`/projekte/${projektId}`);
  revalidatePath(`/projekte/${projektId}/lv/${lvId}`);
}

/**
 * Dupliziert ein LV inklusive Gruppenstruktur, Positionen und Kalkulation
 * (ohne Angebote, Aufmaße und Rechnungen).
 */
export async function lvDuplizieren(projektId: string, lvId: string) {
  const user = await requireBearbeiter();
  const lv = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    include: {
      gruppen: true,
      positionen: true,
      kalkulation: { include: { ansaetze: true } },
    },
  });
  if (!lv) throw new Error("LV nicht gefunden");

  const neuesLvId = await prisma.$transaction(async (tx) => {
    const neuesLv = await tx.lv.create({
      data: {
        projektId,
        bezeichnung: `${lv.bezeichnung} (Kopie)`,
        art: lv.art,
        waehrung: lv.waehrung,
        ustSatz: lv.ustSatz,
        deckungsruecklass: lv.deckungsruecklass,
        haftruecklass: lv.haftruecklass,
        skonto: lv.skonto,
        skontoTage: lv.skontoTage,
      },
    });

    // Gruppen topologisch kopieren (Eltern vor Kindern)
    const gruppenMap = new Map<string, string>();
    const rest = [...lv.gruppen];
    while (rest.length) {
      let fortschritt = false;
      for (let i = rest.length - 1; i >= 0; i--) {
        const g = rest[i];
        if (g.parentId && !gruppenMap.has(g.parentId)) continue;
        const neu = await tx.lvGruppe.create({
          data: {
            lvId: neuesLv.id,
            parentId: g.parentId ? gruppenMap.get(g.parentId) : null,
            ebene: g.ebene,
            nummer: g.nummer,
            bezeichnung: g.bezeichnung,
            sortier: g.sortier,
          },
        });
        gruppenMap.set(g.id, neu.id);
        rest.splice(i, 1);
        fortschritt = true;
      }
      if (!fortschritt) break;
    }

    const positionsMap = new Map<string, string>();
    for (const p of lv.positionen) {
      const gruppeId = gruppenMap.get(p.gruppeId);
      if (!gruppeId) continue;
      const neu = await tx.position.create({
        data: {
          lvId: neuesLv.id,
          gruppeId,
          nummer: p.nummer,
          stichwort: p.stichwort,
          langtext: p.langtext,
          einheit: p.einheit,
          menge: p.menge,
          art: p.art,
          epLohn: p.epLohn,
          epSonstiges: p.epSonstiges,
          sortier: p.sortier,
        },
      });
      positionsMap.set(p.id, neu.id);
    }

    if (lv.kalkulation) {
      const k = lv.kalkulation;
      await tx.kalkulation.create({
        data: {
          lvId: neuesLv.id,
          mittellohnkosten: k.mittellohnkosten,
          zuschlagLohn: k.zuschlagLohn,
          zuschlagMaterial: k.zuschlagMaterial,
          zuschlagGeraet: k.zuschlagGeraet,
          zuschlagFremd: k.zuschlagFremd,
          zuschlagSonstiges: k.zuschlagSonstiges,
          ansaetze: {
            create: k.ansaetze
              .filter((a) => positionsMap.has(a.positionId))
              .map((a) => ({
                positionId: positionsMap.get(a.positionId)!,
                art: a.art,
                bezeichnung: a.bezeichnung,
                menge: a.menge,
                einheit: a.einheit,
                preis: a.preis,
                sortier: a.sortier,
              })),
          },
        },
      });
    }

    return neuesLv.id;
  });

  revalidatePath(`/projekte/${projektId}`);
  redirect(`/projekte/${projektId}/lv/${neuesLvId}`);
}
