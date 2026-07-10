// Rechenlogik der Kalkulation (ÖNORM B 2061, vereinfacht).
// Wird client- und serverseitig identisch verwendet, damit Anzeige und
// Preisübernahme nie auseinanderlaufen.

export interface KalkParams {
  mittellohnkosten: number;
  zuschlagLohn: number;
  zuschlagMaterial: number;
  zuschlagGeraet: number;
  zuschlagFremd: number;
  zuschlagSonstiges: number;
}

export interface AnsatzWerte {
  art: string; // AnsatzArt
  menge: number;
  preis: number;
}

export function mittellohnpreis(p: KalkParams): number {
  return p.mittellohnkosten * (1 + p.zuschlagLohn / 100);
}

function zuschlagFuer(art: string, p: KalkParams): number {
  switch (art) {
    case "MATERIAL":
      return p.zuschlagMaterial;
    case "GERAET":
      return p.zuschlagGeraet;
    case "FREMDLEISTUNG":
      return p.zuschlagFremd;
    default:
      return p.zuschlagSonstiges;
  }
}

/** Kosten eines Ansatzes je LV-Einheit, aufgeteilt in Lohn-/Sonstiges-Anteil. */
export function ansatzKosten(
  a: AnsatzWerte,
  p: KalkParams
): { lohn: number; sonstiges: number } {
  if (a.art === "LOHN") {
    return { lohn: a.menge * mittellohnpreis(p), sonstiges: 0 };
  }
  return {
    lohn: 0,
    sonstiges: a.menge * a.preis * (1 + zuschlagFuer(a.art, p) / 100),
  };
}

export function runde2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Kalkulierter Einheitspreis einer Position aus ihren Ansätzen. */
export function positionsEp(
  ansaetze: AnsatzWerte[],
  p: KalkParams
): { epLohn: number; epSonstiges: number } {
  let lohn = 0;
  let sonstiges = 0;
  for (const a of ansaetze) {
    const k = ansatzKosten(a, p);
    lohn += k.lohn;
    sonstiges += k.sonstiges;
  }
  return { epLohn: runde2(lohn), epSonstiges: runde2(sonstiges) };
}
