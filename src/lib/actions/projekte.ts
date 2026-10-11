"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBearbeiter } from "@/lib/session";
import type { LvArt, ProjektStatus } from "@prisma/client";

const PROJEKT_STATUS: ReadonlySet<string> = new Set([
  "AKTIV",
  "ABGESCHLOSSEN",
  "ARCHIVIERT",
]);

const LV_ARTEN: ReadonlySet<string> = new Set([
  "ENTWURFS_LV",
  "KOSTENSCHAETZUNGS_LV",
  "AUSSCHREIBUNGS_LV",
  "ANGEBOTS_LV",
  "VERTRAGS_LV",
  "ABRECHNUNGS_LV",
]);

class FormularFehler extends Error {}

function prozent(formData: FormData, feld: string, bezeichnung: string) {
  const wert = Number(formData.get(feld));
  if (!Number.isFinite(wert) || wert < 0 || wert > 100) {
    throw new FormularFehler(`${bezeichnung} muss zwischen 0 und 100 % liegen.`);
  }
  return wert;
}

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
  const status = String(formData.get("status") ?? "");
  if (!nummer || !bezeichnung) {
    throw new FormularFehler("Projektnummer und Bezeichnung sind erforderlich.");
  }
  if (!PROJEKT_STATUS.has(status)) {
    throw new FormularFehler("Ungültiger Projektstatus.");
  }

  const aktualisiert = await prisma.projekt.updateMany({
    where: { id: projektId, tenantId: user.tenantId },
    data: {
      nummer,
      bezeichnung,
      status: status as ProjektStatus,
      auftraggeber: String(formData.get("auftraggeber") ?? "").trim() || null,
      ort: String(formData.get("ort") ?? "").trim() || null,
    },
  });
  if (aktualisiert.count === 0) throw new FormularFehler("Projekt nicht gefunden.");
  revalidatePath("/");
  revalidatePath(`/projekte/${projektId}`);
}

export async function projektAendernMitRueckmeldung(projektId: string, formData: FormData) {
  try {
    await projektAendern(projektId, formData);
    return { error: "" };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: error instanceof FormularFehler
        ? error.message
        : "Projekt konnte nicht gespeichert werden.",
    };
  }
}

export async function projektLoeschen(projektId: string) {
  const user = await requireBearbeiter();
  const vertraege = await prisma.lv.count({
    where: {
      projekt: { id: projektId, tenantId: user.tenantId },
      angebotId: { not: null },
    },
  });
  if (vertraege > 0) {
    throw new Error(
      "Das Projekt enthält ein Vertrags-LV mit Vergabehistorie und kann nicht gelöscht werden – bitte stattdessen archivieren"
    );
  }
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
  const vertraege = await prisma.lv.count({
    where: {
      projekt: { id: projektId, tenantId: user.tenantId },
      OR: [
        { id: lvId, angebotId: { not: null } },
        { angebot: { lvId } },
      ],
    },
  });
  if (vertraege > 0) {
    throw new Error("Das LV ist mit einem Vertrags-LV verknüpft und kann nicht gelöscht werden");
  }
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
  if (!bezeichnung) throw new FormularFehler("Die LV-Bezeichnung ist erforderlich.");
  if (!LV_ARTEN.has(art)) throw new FormularFehler("Ungültige LV-Art.");
  const ustSatz = prozent(formData, "ustSatz", "Der USt-Satz");
  const deckungsruecklass = prozent(formData, "deckungsruecklass", "Der Deckungsrücklass");
  const haftruecklass = prozent(formData, "haftruecklass", "Der Haftrücklass");
  const skonto = prozent(formData, "skonto", "Der Skonto");
  const skontoTage = Number(formData.get("skontoTage"));
  if (!Number.isInteger(skontoTage) || skontoTage < 0 || skontoTage > 3650) {
    throw new FormularFehler("Die Skontofrist muss zwischen 0 und 3650 Tagen liegen.");
  }

  const bisher = await prisma.lv.findFirst({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    select: {
      art: true,
      angebotId: true,
      angebote: { where: { vertragsLv: { isNot: null } }, select: { id: true }, take: 1 },
    },
  });
  if (!bisher) throw new FormularFehler("LV nicht gefunden.");
  if (art !== bisher.art && (bisher.angebotId || bisher.angebote.length > 0)) {
    throw new FormularFehler("Die LV-Art ist nach der Vergabe festgelegt.");
  }

  const aktualisiert = await prisma.lv.updateMany({
    where: { id: lvId, projekt: { id: projektId, tenantId: user.tenantId } },
    data: {
      bezeichnung,
      art,
      ustSatz,
      deckungsruecklass,
      haftruecklass,
      skonto,
      skontoTage,
    },
  });
  if (aktualisiert.count === 0) throw new FormularFehler("LV nicht gefunden.");
  revalidatePath(`/projekte/${projektId}`);
  revalidatePath(`/projekte/${projektId}/lv/${lvId}`);
}

export async function lvAendernMitRueckmeldung(
  projektId: string,
  lvId: string,
  formData: FormData
) {
  try {
    await lvAendern(projektId, lvId, formData);
    return { error: "" };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: error instanceof FormularFehler
        ? error.message
        : "LV konnte nicht gespeichert werden.",
    };
  }
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
