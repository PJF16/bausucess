import { readFileSync, writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

type XmlWert = string | number | XmlObjekt | XmlWert[] | null | undefined;
interface XmlObjekt {
  [key: string]: XmlWert;
}

interface KatalogPosition {
  n: string;
  s: string;
  e: string;
  l: string;
  g: string;
}

function liste<T>(wert: T | T[] | undefined): T[] {
  if (wert === undefined) return [];
  return Array.isArray(wert) ? wert : [wert];
}

function textAus(wert: XmlWert, schluessel = ""): string {
  if (wert === null || wert === undefined) {
    return schluessel === "al" ? "[…]" : "";
  }
  if (typeof wert === "string" || typeof wert === "number") {
    if (schluessel === "al" && String(wert).trim() === "") return "[…]";
    return String(wert);
  }
  if (Array.isArray(wert)) {
    return wert.map((teil) => textAus(teil, schluessel)).filter(Boolean).join("\n");
  }

  return Object.entries(wert)
    .map(([key, teil]) => textAus(teil, key))
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function eigenschaften(position: XmlObjekt): XmlObjekt {
  return (position["pos-eigenschaften"] ?? {}) as XmlObjekt;
}

const [quelle, ziel] = process.argv.slice(2);
if (!quelle || !ziel) {
  throw new Error(
    "Aufruf: npx tsx scripts/import-lb-hb.ts <quelle.onlb> <ziel.json>"
  );
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
}).parse(readFileSync(quelle, "utf8")) as XmlObjekt;

const onlb = xml.onlb as XmlObjekt;
const lgListe = onlb["lg-liste"] as XmlObjekt;
const ergebnis: KatalogPosition[] = [];

for (const lg of liste(lgListe.lg as XmlObjekt | XmlObjekt[])) {
  const lgNr = String(lg.nr);
  const lgEigenschaften = lg["lg-eigenschaften"] as XmlObjekt;
  const lgName = textAus(lgEigenschaften?.ueberschrift);
  const ulgListe = lg["ulg-liste"] as XmlObjekt | undefined;

  for (const ulg of liste(ulgListe?.ulg as XmlObjekt | XmlObjekt[] | undefined)) {
    const ulgNr = String(ulg.nr);
    const ulgEigenschaften = ulg["ulg-eigenschaften"] as XmlObjekt;
    const ulgName = textAus(ulgEigenschaften?.ueberschrift);
    const gruppenPfad = `${lgNr} ${lgName} › ${lgNr}.${ulgNr} ${ulgName}`;
    const positionen = ulg.positionen as XmlObjekt | undefined;

    for (const grundtextnr of liste(
      positionen?.grundtextnr as XmlObjekt | XmlObjekt[] | undefined
    )) {
      const grundNr = String(grundtextnr.nr);
      const nummerBasis = `${lgNr}${ulgNr}${grundNr}`;
      const grundtext = textAus(
        (grundtextnr.grundtext as XmlObjekt | undefined)?.langtext
      );

      for (const position of liste(
        grundtextnr.ungeteilteposition as XmlObjekt | XmlObjekt[] | undefined
      )) {
        const props = eigenschaften(position);
        const stichwort = textAus(props.stichwort) ||
          `${textAus(props["stichwort-kurz"])} […]`.trim();
        const folgetext = textAus(props.langtext);
        ergebnis.push({
          n: nummerBasis,
          s: stichwort,
          e: textAus(props.einheit),
          l: [grundtext, folgetext].filter(Boolean).join("\n\n"),
          g: gruppenPfad,
        });
      }

      for (const position of liste(
        grundtextnr.folgeposition as XmlObjekt | XmlObjekt[] | undefined
      )) {
        const props = eigenschaften(position);
        const stichwort = textAus(props.stichwort) ||
          `${textAus(props["stichwort-kurz"])} […]`.trim();
        const folgetext = textAus(props.langtext);
        ergebnis.push({
          n: `${nummerBasis}${String(position.ftnr)}`,
          s: stichwort,
          e: textAus(props.einheit),
          l: [grundtext, folgetext].filter(Boolean).join("\n\n"),
          g: gruppenPfad,
        });
      }
    }
  }
}

const doppelte = ergebnis.filter(
  (position, index) => ergebnis.findIndex((p) => p.n === position.n) !== index
);
if (doppelte.length > 0) {
  throw new Error(`Doppelte Positionsnummern: ${doppelte.slice(0, 5).map((p) => p.n)}`);
}

writeFileSync(ziel, `${JSON.stringify(ergebnis)}\n`);
console.log(`${ergebnis.length} Positionen nach ${ziel} geschrieben.`);
