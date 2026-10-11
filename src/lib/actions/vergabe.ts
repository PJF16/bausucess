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
  const mitAngeboten = await prisma.angebot.count({
    where: { bieterId, bieter: { tenantId: user.tenantId } },
  });
  if (mitAngeboten > 0) {
    throw new Error("Bieter mit Angebotsverlauf kann nicht gelöscht werden. Archivieren Sie ihn stattdessen.");
  }
  await prisma.bieter.deleteMany({
    where: { id: bieterId, tenantId: user.tenantId },
  });
  revalidatePath("/bieter");
}

export async function bieterArchivStatusSetzen(bieterId: string, archivieren: boolean) {
  const user = await requireBearbeiter();
  const aktualisiert = await prisma.bieter.updateMany({
    where: { id: bieterId, tenantId: user.tenantId },
    data: { archiviertAm: archivieren ? new Date() : null },
  });
  if (!aktualisiert.count) throw new Error("Bieter nicht gefunden");
  revalidatePath("/bieter");
  revalidatePath("/");
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
  await prisma.$transaction(async (tx) => {
    const verfuegbar = await tx.bieter.updateMany({
      where: { id: bieterId, tenantId, archiviertAm: null },
      data: { archiviertAm: null },
    });
    if (!verfuegbar.count) throw new Error("Bieter nicht gefunden oder archiviert");
    await tx.angebot.upsert({
      where: { lvId_bieterId: { lvId, bieterId } },
      update: {},
      create: { lvId, bieterId },
    });
  });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function angebotEntfernen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  const angebot = await prisma.angebot.findFirst({ where: { id: angebotId, lvId }, select: { status: true, vertragsLv: { select: { id: true } } } });
  if (angebot?.vertragsLv || angebot?.status === "ZUSCHLAG") {
    throw new Error("Ein bezuschlagtes oder vertraglich übernommenes Angebot kann nicht entfernt werden");
  }
  await prisma.angebot.deleteMany({ where: { id: angebotId, lvId } });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function angebotStatusSetzen(
  lvId: string,
  angebotId: string,
  status: AngebotStatus
) {
  const { lv } = await lvDesMandanten(lvId);
  if (status === "ZUSCHLAG") throw new Error("Zuschlag bitte über die geprüfte Zuschlagsfunktion erteilen");
  const angebot = await prisma.angebot.findFirst({ where: { id: angebotId, lvId }, select: { status: true } });
  if (!angebot) throw new Error("Angebot nicht gefunden");
  if (angebot.status === "ZUSCHLAG" || await prisma.lv.count({ where: { angebotId } })) {
    throw new Error("Status eines bezuschlagten oder vertraglich übernommenen Angebots ist gesperrt");
  }
  if (status === "ABGEGEBEN" && angebot.status !== "EINGELADEN") throw new Error("Ungültiger Angebotsstatus");
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
  if (typeof ep !== "number" || !Number.isFinite(ep) || ep < 0) {
    throw new Error("Ungültiger Einheitspreis");
  }
  await prisma.$transaction(async (tx) => {
    // Schreibsperre auf dem Angebotsdatensatz serialisiert Preisänderung mit
    // Zuschlagserteilung und verhindert Änderungen am gerade bezuschlagten Angebot.
    const angebot = await tx.angebot.updateMany({
      where: { id: angebotId, lvId, status: { in: ["EINGELADEN", "ABGEGEBEN"] } },
      data: { status: "ABGEGEBEN" },
    });
    if (!angebot.count) throw new Error("Angebot nicht gefunden oder bereits bezuschlagt");
    if (await tx.lv.count({ where: { angebotId } })) {
      throw new Error("Angebotspreise können nach Vertragserstellung nicht mehr geändert werden");
    }
    const position = await tx.position.findFirst({ where: { id: positionId, lvId } });
    if (!position) throw new Error("Position nicht gefunden");
    await tx.angebotsPosition.upsert({
      where: { angebotId_positionId: { angebotId, positionId } },
      update: { ep },
      create: { angebotId, positionId, ep },
    });
  }, { isolationLevel: "Serializable" });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

/** Erteilt den Zuschlag an ein Angebot; ein zuvor erteilter Zuschlag im selben LV wird zurückgesetzt. */
export async function zuschlagErteilen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.$transaction(async (tx) => {
    const gesperrt = await tx.angebot.updateMany({
      where: { id: angebotId, lvId, status: { in: ["ABGEGEBEN", "ZUSCHLAG"] } },
      data: { status: "ABGEGEBEN" },
    });
    if (!gesperrt.count) throw new Error("Nur ein abgegebenes Angebot kann bezuschlagt werden");
    const angebot = await tx.angebot.findFirst({ where: { id: angebotId, lvId }, include: { preise: true } });
    if (!angebot) throw new Error("Angebot nicht gefunden");
    if (angebot.status !== "ABGEGEBEN" && angebot.status !== "ZUSCHLAG") {
      throw new Error("Nur ein abgegebenes Angebot kann bezuschlagt werden");
    }
    if (await tx.lv.count({ where: { angebot: { lvId, status: "ZUSCHLAG" } } })) {
      throw new Error("Der bestehende Zuschlag wurde bereits vertraglich übernommen und kann nicht ersetzt werden");
    }
    if (await tx.lv.count({ where: { angebotId } })) {
      throw new Error("Für dieses Angebot besteht bereits ein Vertrags-LV");
    }
    const preisMap = new Map(angebot.preise.map((p) => [p.positionId, Number(p.ep)]));
    const relevant = await tx.position.findMany({
      where: { lvId, art: { notIn: ["EVENTUAL", "ALTERNATIV"] } }, select: { id: true },
    });
    const fehlende = relevant.filter((p) => {
      const ep = preisMap.get(p.id);
      return ep === undefined || !Number.isFinite(ep) || ep <= 0;
    });
    if (fehlende.length) {
      throw new Error(`Zuschlag nicht möglich: Für ${fehlende.length} relevante Position(en) fehlt ein gültiger positiver Angebotspreis`);
    }
    await tx.angebot.updateMany({
      where: { lvId, status: "ZUSCHLAG", id: { not: angebotId } },
      data: { status: "ABGEGEBEN" },
    });
    // lvId in der Bedingung: der Zuschlag darf nur ein Angebot dieses
    // (mandantengeprüften) LV treffen, nie ein fremdes per manipulierter ID.
    const erteilt = await tx.angebot.updateMany({
      where: { id: angebotId, lvId, status: { in: ["ABGEGEBEN", "ZUSCHLAG"] } },
      data: { status: "ZUSCHLAG" },
    });
    if (erteilt.count === 0) throw new Error("Angebot nicht gefunden");
  }, { isolationLevel: "Serializable" });
  revalidatePath(vergabePfad(lv.projektId, lvId));
}

export async function zuschlagZurueckziehen(lvId: string, angebotId: string) {
  const { lv } = await lvDesMandanten(lvId);
  await prisma.$transaction(async (tx) => {
    const geaendert = await tx.angebot.updateMany({
      where: { id: angebotId, lvId, status: "ZUSCHLAG" },
      data: { status: "ABGEGEBEN" },
    });
    if (!geaendert.count) return;
    if (await tx.lv.count({ where: { angebotId } })) {
      throw new Error("Der Zuschlag kann nicht zurückgezogen werden, weil daraus bereits ein Vertrags-LV erstellt wurde");
    }
  }, { isolationLevel: "Serializable" });
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
  if (angebot.status !== "ZUSCHLAG") {
    throw new Error("Nur das bezuschlagte Angebot kann zum Vertrags-LV werden");
  }
  const preisJePosition = new Map(angebot.preise.map((p) => [p.positionId, Number(p.ep)]));

  const neuesLvId = await prisma.$transaction(async (tx) => {
    const gesperrt = await tx.angebot.updateMany({
      where: { id: angebotId, lvId, status: "ZUSCHLAG" },
      data: { status: "ZUSCHLAG" },
    });
    if (!gesperrt.count) throw new Error("Angebot ist nicht mehr bezuschlagt");
    if (await tx.lv.count({ where: { angebotId } })) {
      throw new Error("Für dieses Angebot wurde bereits ein Vertrags-LV erstellt");
    }
    const neuesLv = await tx.lv.create({
      data: {
        projektId: lv.projektId,
        angebotId,
        bezeichnung: `${lv.bezeichnung} (Vertrag – ${angebot.bieter.firma})`,
        art: "VERTRAGS_LV",
        waehrung: lv.waehrung,
        ustSatz: lv.ustSatz,
        // Abrechnungskonditionen mitnehmen – das Vertrags-LV ist das LV,
        // das später abgerechnet wird.
        deckungsruecklass: lv.deckungsruecklass,
        haftruecklass: lv.haftruecklass,
        skonto: lv.skonto,
        skontoTage: lv.skontoTage,
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
      if (positionZaehltImVertrag(p.art) && (bidEp === undefined || !Number.isFinite(bidEp) || bidEp <= 0)) {
        throw new Error(`Vertrags-LV kann nicht erzeugt werden: Angebotspreis für Position ${p.nummer} fehlt oder ist ungültig`);
      }
      // Unbewertete Eventual-/Alternativpositionen werden bewusst mit 0
      // übernommen; Ausschreibungs-Eigenpreise dürfen nie in den Vertrag rutschen.
      let epLohn = bidEp === undefined ? 0 : Number(p.epLohn);
      let epSonstiges = bidEp === undefined ? 0 : Number(p.epSonstiges);
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
  }, { isolationLevel: "Serializable" });

  revalidatePath(`/projekte/${lv.projektId}`);
  redirect(`/projekte/${lv.projektId}/lv/${neuesLvId}`);
}

function positionZaehltImVertrag(art: string) {
  return art !== "EVENTUAL" && art !== "ALTERNATIV";
}
