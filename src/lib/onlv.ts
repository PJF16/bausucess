// ÖNORM-A-2063-angelehnter Datenaustausch (.onlv).
//
// Hinweis: Das offizielle A-2063-Schema (XSD) ist kostenpflichtig bei
// Austrian Standards und hier bewusst nicht nachgebaut. Dieses Modul
// exportiert ein an A 2063 angelehntes XML (Kenndaten, Gliederung
// HG/OG/LG/ULG, Positionen mit Preisanteilen Lohn/Sonstiges) und
// importiert tolerant: alternative Elementnamen (hg/og/lg/ulg, pos),
// Attribute statt Kindelemente und Komma-Dezimalzahlen werden akzeptiert.
// 100%-Kompatibilität mit echten AUER/ABK-Datenträgern ist ohne die
// offizielle XSD nicht garantiert.

import { XMLParser } from "fast-xml-parser";

export type OnlvEbene = "HG" | "OG" | "LG" | "ULG";

export interface OnlvPosition {
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
  menge: number;
  art: string; // PositionsArt
  epLohn: number;
  epSonstiges: number;
}

export interface OnlvGruppe {
  ebene: OnlvEbene;
  nummer: string;
  bezeichnung: string;
  gruppen: OnlvGruppe[];
  positionen: OnlvPosition[];
}

export interface OnlvLv {
  bezeichnung: string;
  art: string; // LvArt
  waehrung: string;
  ustSatz: number;
  gruppen: OnlvGruppe[];
}

// ── Export ──────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function zahlZuXml(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function gruppeZuXml(g: OnlvGruppe, einzug: string): string {
  const zeilen: string[] = [];
  zeilen.push(
    `${einzug}<gruppe ebene="${g.ebene}" nr="${xmlEscape(g.nummer)}">`
  );
  zeilen.push(`${einzug}  <bezeichnung>${xmlEscape(g.bezeichnung)}</bezeichnung>`);
  for (const p of g.positionen) {
    zeilen.push(`${einzug}  <position nr="${xmlEscape(p.nummer)}" art="${p.art}">`);
    zeilen.push(`${einzug}    <stichwort>${xmlEscape(p.stichwort)}</stichwort>`);
    if (p.langtext) {
      zeilen.push(`${einzug}    <langtext>${xmlEscape(p.langtext)}</langtext>`);
    }
    zeilen.push(`${einzug}    <me>${xmlEscape(p.einheit)}</me>`);
    zeilen.push(`${einzug}    <menge>${zahlZuXml(p.menge)}</menge>`);
    zeilen.push(`${einzug}    <preisanteile>`);
    zeilen.push(`${einzug}      <lohn>${zahlZuXml(p.epLohn)}</lohn>`);
    zeilen.push(`${einzug}      <sonstiges>${zahlZuXml(p.epSonstiges)}</sonstiges>`);
    zeilen.push(`${einzug}    </preisanteile>`);
    zeilen.push(`${einzug}  </position>`);
  }
  for (const kind of g.gruppen) {
    zeilen.push(gruppeZuXml(kind, einzug + "  "));
  }
  zeilen.push(`${einzug}</gruppe>`);
  return zeilen.join("\n");
}

export function lvZuOnlvXml(lv: OnlvLv, erstelltAm?: string): string {
  const zeilen: string[] = [];
  zeilen.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  zeilen.push(`<onlv xmlns="http://www.oenorm.at/schema/A2063" version="A2063-angelehnt-1.0">`);
  zeilen.push(`  <metadaten>`);
  if (erstelltAm) zeilen.push(`    <erstellt>${xmlEscape(erstelltAm)}</erstellt>`);
  zeilen.push(`    <software>BauSuccess Web</software>`);
  zeilen.push(`    <lvart>${xmlEscape(lv.art)}</lvart>`);
  zeilen.push(`    <waehrung>${xmlEscape(lv.waehrung)}</waehrung>`);
  zeilen.push(`    <ustsatz>${zahlZuXml(lv.ustSatz)}</ustsatz>`);
  zeilen.push(`  </metadaten>`);
  zeilen.push(`  <lv>`);
  zeilen.push(`    <bezeichnung>${xmlEscape(lv.bezeichnung)}</bezeichnung>`);
  zeilen.push(`    <gliederung>`);
  for (const g of lv.gruppen) {
    zeilen.push(gruppeZuXml(g, "      "));
  }
  zeilen.push(`    </gliederung>`);
  zeilen.push(`  </lv>`);
  zeilen.push(`</onlv>`);
  return zeilen.join("\n");
}

// ── Import ──────────────────────────────────────────────────────────

/** Text aus einem Knoten holen: String, Zahl oder { "#text": … }. */
function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return text((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

/** Zahl mit Komma- oder Punkt-Dezimaltrennung parsen. */
function zahl(v: unknown, fallback = 0): number {
  const s = text(v).replace(/\s/g, "");
  if (!s) return fallback;
  // "1.234,56" (AT-Format) → "1234.56"; "12.5" bleibt "12.5"
  const normalisiert =
    s.includes(",") ? s.replaceAll(".", "").replace(",", ".") : s;
  const n = Number(normalisiert);
  return Number.isFinite(n) ? n : fallback;
}

type XmlNode = Record<string, unknown>;

/** Kind-Knoten unter einem der angegebenen Namen als Array einsammeln. */
function kinder(node: XmlNode, namen: string[]): XmlNode[] {
  const ergebnis: XmlNode[] = [];
  for (const name of namen) {
    const v = node[name];
    if (v === undefined || v === null) continue;
    for (const eintrag of Array.isArray(v) ? v : [v]) {
      if (typeof eintrag === "object" && eintrag !== null) {
        ergebnis.push(eintrag as XmlNode);
      }
    }
  }
  return ergebnis;
}

/** Wert aus Attribut ("@_nr") oder Kindelement ("nr") lesen. */
function attrOderKind(node: XmlNode, ...namen: string[]): string {
  for (const name of namen) {
    const attr = node[`@_${name}`];
    if (attr !== undefined) return text(attr);
    const kind = node[name];
    if (kind !== undefined) return text(kind);
  }
  return "";
}

const GRUPPEN_NAMEN = ["gruppe", "hg", "og", "lg", "ulg", "leistungsgruppe", "unterleistungsgruppe"];
const POSITIONS_NAMEN = ["position", "pos", "grundtext"];

const EBENE_JE_NAME: Record<string, OnlvEbene> = {
  hg: "HG",
  og: "OG",
  lg: "LG",
  ulg: "ULG",
  leistungsgruppe: "LG",
  unterleistungsgruppe: "ULG",
};

const GUELTIGE_POSITIONSARTEN = new Set([
  "NORMAL",
  "WESENTLICH",
  "EVENTUAL",
  "ALTERNATIV",
  "REGIE",
]);

function positionParsen(node: XmlNode): OnlvPosition {
  const artRoh = attrOderKind(node, "art", "positionsart").toUpperCase();
  return {
    nummer: attrOderKind(node, "nr", "nummer", "posnr"),
    stichwort: text(node["stichwort"] ?? node["kurztext"]),
    langtext: text(node["langtext"]),
    einheit: text(node["me"] ?? node["einheit"] ?? node["mengeneinheit"]) || "PA",
    menge: zahl(node["menge"] ?? node["lvmenge"]),
    art: GUELTIGE_POSITIONSARTEN.has(artRoh) ? artRoh : "NORMAL",
    epLohn: zahl(
      (node["preisanteile"] as XmlNode | undefined)?.["lohn"] ??
        node["eplohn"] ??
        node["preisanteillohn"]
    ),
    epSonstiges: zahl(
      (node["preisanteile"] as XmlNode | undefined)?.["sonstiges"] ??
        node["epsonstiges"] ??
        node["preisanteilsonstiges"]
    ),
  };
}

/** Maximale Verschachtelungstiefe der Gruppen unter einem Knoten. */
function gruppenTiefe(node: XmlNode): number {
  let max = 0;
  for (const name of GRUPPEN_NAMEN) {
    for (const kind of kinder(node, [name])) {
      max = Math.max(max, 1 + gruppenTiefe(kind));
    }
  }
  return max;
}

const EBENEN_FOLGE: OnlvEbene[] = ["HG", "OG", "LG", "ULG"];

function gruppeParsen(
  node: XmlNode,
  elementName: string,
  fallbackEbene: OnlvEbene
): OnlvGruppe {
  const ebeneRoh = attrOderKind(node, "ebene").toUpperCase();
  const ebene: OnlvEbene =
    (EBENEN_FOLGE as string[]).includes(ebeneRoh)
      ? (ebeneRoh as OnlvEbene)
      : (EBENE_JE_NAME[elementName] ?? fallbackEbene);

  const naechste: OnlvEbene =
    EBENEN_FOLGE[Math.min(EBENEN_FOLGE.indexOf(ebene) + 1, EBENEN_FOLGE.length - 1)];

  const untergruppen: OnlvGruppe[] = [];
  for (const name of GRUPPEN_NAMEN) {
    for (const kind of kinder(node, [name])) {
      untergruppen.push(gruppeParsen(kind, name, naechste));
    }
  }

  return {
    ebene,
    nummer: attrOderKind(node, "nr", "nummer"),
    bezeichnung:
      text(node["bezeichnung"] ?? node["stichwort"] ?? node["ueberschrift"]),
    gruppen: untergruppen,
    positionen: kinder(node, POSITIONS_NAMEN).map(positionParsen),
  };
}

const GUELTIGE_LVARTEN = new Set([
  "ENTWURFS_LV",
  "KOSTENSCHAETZUNGS_LV",
  "AUSSCHREIBUNGS_LV",
  "ANGEBOTS_LV",
  "VERTRAGS_LV",
  "ABRECHNUNGS_LV",
]);

/**
 * Parst eine .onlv-Datei. Wirft Error mit verständlicher Meldung,
 * wenn keine LV-Struktur erkennbar ist.
 */
export function onlvXmlParsen(xml: string): OnlvLv {
  let wurzel: XmlNode;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      trimValues: true,
      removeNSPrefix: true,
      transformTagName: (name) => name.toLowerCase(),
    });
    wurzel = parser.parse(xml) as XmlNode;
  } catch {
    throw new Error("Die Datei ist kein gültiges XML.");
  }

  const onlv = (wurzel["onlv"] ?? wurzel) as XmlNode;
  const meta = (onlv["metadaten"] ?? onlv["kenndaten"] ?? {}) as XmlNode;
  const lvNode = (onlv["lv"] ?? onlv["leistungsverzeichnis"] ?? onlv) as XmlNode;

  // Gliederung kann direkt im LV oder unter <gliederung> liegen
  const gliederung = (lvNode["gliederung"] ?? lvNode) as XmlNode;

  // Fallback-Ebene so wählen, dass die tiefste Ebene auf ULG endet
  const tiefe = Math.max(1, gruppenTiefe(gliederung));
  const startIndex = Math.max(0, EBENEN_FOLGE.length - tiefe);
  const fallbackStart = EBENEN_FOLGE[Math.min(startIndex, 2)]; // nie tiefer als LG starten

  const gruppen: OnlvGruppe[] = [];
  for (const name of GRUPPEN_NAMEN) {
    for (const kind of kinder(gliederung, [name])) {
      gruppen.push(gruppeParsen(kind, name, fallbackStart));
    }
  }

  const anzahlPositionen = (liste: OnlvGruppe[]): number =>
    liste.reduce(
      (acc, g) => acc + g.positionen.length + anzahlPositionen(g.gruppen),
      0
    );

  if (gruppen.length === 0 || anzahlPositionen(gruppen) === 0) {
    throw new Error(
      "In der Datei wurde keine LV-Struktur (Gruppen mit Positionen) gefunden."
    );
  }

  const artRoh = text(meta["lvart"] ?? onlv["lvart"]).toUpperCase();

  return {
    bezeichnung:
      text(lvNode["bezeichnung"] ?? meta["bezeichnung"]) || "Importiertes LV",
    art: GUELTIGE_LVARTEN.has(artRoh) ? artRoh : "AUSSCHREIBUNGS_LV",
    waehrung: text(meta["waehrung"]) || "EUR",
    ustSatz: zahl(meta["ustsatz"] ?? meta["ust-satz"], 20),
    gruppen,
  };
}
