// Auswertung von Aufmaß-Ansätzen (ÖNORM-üblich: Rechenformel je Zeile,
// z. B. "12,50*3,20-2*1,01"). Bewusst ohne eval(): kleiner
// Recursive-Descent-Parser für + - * / ( ) mit Komma- oder Punkt-Dezimal.
// Wird client- (Live-Vorschau) und serverseitig (Speichern) identisch genutzt.

type Token =
  | { typ: "zahl"; wert: number }
  | { typ: "op"; wert: "+" | "-" | "*" | "/" }
  | { typ: "auf" }
  | { typ: "zu" };

/**
 * Zahl im AT-Format parsen. Komma ist Dezimaltrennzeichen, Punkt wird nur
 * als Tausendertrennzeichen akzeptiert, wenn das Muster eindeutig ist
 * ("1.234,56" oder "1.234.567"). Reine Punkt-Zahlen wie "1.200" sind
 * mehrdeutig (1,2 oder 1200?) und werden abgelehnt, damit nie stillschweigend
 * eine falsche Menge abgerechnet wird; "12.5" bleibt als Dezimalzahl gültig.
 */
function zahlParsen(ziffern: string): number | null {
  const kommas = (ziffern.match(/,/g) ?? []).length;
  const punkte = (ziffern.match(/\./g) ?? []).length;
  let normalisiert: string;
  if (kommas > 1) return null;
  if (kommas === 1 && punkte > 0) {
    // Punkt(e) können nur Tausendertrennzeichen sein: "1.234,56"
    if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(ziffern)) return null;
    normalisiert = ziffern.replaceAll(".", "").replace(",", ".");
  } else if (kommas === 1) {
    normalisiert = ziffern.replace(",", ".");
  } else if (punkte > 0) {
    // Tausenderpunkt-Muster ohne Komma ist mehrdeutig → ablehnen
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(ziffern)) return null;
    if (punkte > 1) return null;
    normalisiert = ziffern;
  } else {
    normalisiert = ziffern;
  }
  const wert = Number(normalisiert);
  return Number.isFinite(wert) ? wert : null;
}

function tokenisieren(ansatz: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < ansatz.length) {
    const c = ansatz[i];
    if (c === " " || c === "\t") {
      i++;
    } else if (c === "(") {
      tokens.push({ typ: "auf" });
      i++;
    } else if (c === ")") {
      tokens.push({ typ: "zu" });
      i++;
    } else if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ typ: "op", wert: c });
      i++;
    } else if (/[0-9]/.test(c)) {
      let ziffern = "";
      while (i < ansatz.length && /[0-9.,]/.test(ansatz[i])) {
        ziffern += ansatz[i];
        i++;
      }
      const wert = zahlParsen(ziffern);
      if (wert === null) return null;
      tokens.push({ typ: "zahl", wert });
    } else {
      return null; // unbekanntes Zeichen
    }
  }
  return tokens;
}

// Grenzen gegen Stack Overflow bei absurden Eingaben (z. B. per Copy-Paste
// eingefügte Zeichenketten aus tausenden Klammern).
const MAX_LAENGE = 500;
const MAX_TIEFE = 64;

/** Wertet einen Ansatz aus; null bei leerem/ungültigem Ausdruck. */
export function ansatzAuswerten(ansatz: string): number | null {
  if (ansatz.length > MAX_LAENGE) return null;
  const tokenListe = tokenisieren(ansatz.trim());
  if (!tokenListe || tokenListe.length === 0) return null;
  const tokens: Token[] = tokenListe;

  let pos = 0;

  function ausdruck(tiefe: number): number | null {
    let links = term(tiefe);
    if (links === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.typ !== "op" || (t.wert !== "+" && t.wert !== "-")) break;
      pos++;
      const rechts = term(tiefe);
      if (rechts === null) return null;
      links = t.wert === "+" ? links + rechts : links - rechts;
    }
    return links;
  }

  function term(tiefe: number): number | null {
    let links = faktor(tiefe);
    if (links === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.typ !== "op" || (t.wert !== "*" && t.wert !== "/")) break;
      pos++;
      const rechts = faktor(tiefe);
      if (rechts === null) return null;
      if (t.wert === "/") {
        if (rechts === 0) return null;
        links = links / rechts;
      } else {
        links = links * rechts;
      }
    }
    return links;
  }

  function faktor(tiefe: number): number | null {
    if (tiefe > MAX_TIEFE) return null;
    const t = tokens[pos];
    if (!t) return null;
    // Vorzeichen
    if (t.typ === "op" && (t.wert === "-" || t.wert === "+")) {
      pos++;
      const f = faktor(tiefe + 1);
      if (f === null) return null;
      return t.wert === "-" ? -f : f;
    }
    if (t.typ === "zahl") {
      pos++;
      return t.wert;
    }
    if (t.typ === "auf") {
      pos++;
      const inner = ausdruck(tiefe + 1);
      if (inner === null) return null;
      const schluss = tokens[pos];
      if (!schluss || schluss.typ !== "zu") return null;
      pos++;
      return inner;
    }
    return null;
  }

  const ergebnis = ausdruck(0);
  if (ergebnis === null || pos !== tokens.length) return null;
  if (!Number.isFinite(ergebnis)) return null;
  return Math.round(ergebnis * 1000) / 1000; // Mengen auf 3 Nachkommastellen
}
