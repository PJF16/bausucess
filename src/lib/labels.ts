export const lvArtLabel: Record<string, string> = {
  ENTWURFS_LV: "Entwurfs-LV",
  KOSTENSCHAETZUNGS_LV: "Kostenschätzungs-LV",
  AUSSCHREIBUNGS_LV: "Ausschreibungs-LV",
  ANGEBOTS_LV: "Angebots-LV",
  VERTRAGS_LV: "Vertrags-LV",
  ABRECHNUNGS_LV: "Abrechnungs-LV",
};

export const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});

/** Positionsbetrag; Eventual-/Alternativpositionen zählen nicht zur Summe. */
export function positionsBetrag(p: {
  art: string;
  menge: unknown;
  epLohn: unknown;
  epSonstiges: unknown;
}): number {
  if (p.art === "EVENTUAL" || p.art === "ALTERNATIV") return 0;
  return Number(p.menge) * (Number(p.epLohn) + Number(p.epSonstiges));
}
