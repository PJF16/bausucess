export interface LbPositionsDaten {
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
}

const LB_FELDER = ["nummer", "stichwort", "langtext", "einheit"] as const;
const LB_PFLICHTFELDER = ["nummer", "stichwort", "einheit"] as const;

export function lbDatenValidieren(
  daten: Partial<LbPositionsDaten>,
  teilweise: boolean
): Partial<LbPositionsDaten> {
  if (!daten || typeof daten !== "object" || Array.isArray(daten)) {
    throw new Error("Ungültige Positionsdaten");
  }
  for (const feld of Object.keys(daten)) {
    if (!(LB_FELDER as readonly string[]).includes(feld)) {
      throw new Error("Ungültige Positionsdaten");
    }
  }

  const ergebnis: Partial<LbPositionsDaten> = {};
  for (const feld of LB_FELDER) {
    const wert = daten[feld];
    if (wert === undefined) {
      if (teilweise) continue;
      if (feld === "langtext") {
        ergebnis.langtext = "";
        continue;
      }
      throw new Error("Ungültige Positionsdaten");
    }
    if (typeof wert !== "string") throw new Error("Ungültige Positionsdaten");
    const bereinigt = wert.trim();
    const max = feld === "langtext" ? 10000 : feld === "stichwort" ? 500 : feld === "nummer" ? 100 : 50;
    const pflicht = (LB_PFLICHTFELDER as readonly string[]).includes(feld);
    if ((pflicht && !bereinigt) || bereinigt.length > max) {
      throw new Error(`Bitte ${feld} prüfen (maximal ${max} Zeichen).`);
    }
    ergebnis[feld] = bereinigt;
  }
  if (teilweise && Object.keys(ergebnis).length === 0) {
    throw new Error("Keine änderbaren Positionsdaten angegeben");
  }
  return ergebnis;
}
