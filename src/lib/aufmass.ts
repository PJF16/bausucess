// Auswertung von Aufmaß-Ansätzen (ÖNORM-üblich: Rechenformel je Zeile,
// z. B. "12,50*3,20-2*1,01"). Bewusst ohne eval(): kleiner
// Recursive-Descent-Parser für + - * / ( ) mit Komma- oder Punkt-Dezimal.
// Wird client- (Live-Vorschau) und serverseitig (Speichern) identisch genutzt.

type Token =
  | { typ: "zahl"; wert: number }
  | { typ: "op"; wert: "+" | "-" | "*" | "/" }
  | { typ: "auf" }
  | { typ: "zu" };

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
      // Komma als Dezimaltrennzeichen zulassen ("12,5"), Punkt ebenso
      const normalisiert = ziffern.replace(",", ".");
      const wert = Number(normalisiert);
      if (!Number.isFinite(wert)) return null;
      tokens.push({ typ: "zahl", wert });
    } else {
      return null; // unbekanntes Zeichen
    }
  }
  return tokens;
}

/** Wertet einen Ansatz aus; null bei leerem/ungültigem Ausdruck. */
export function ansatzAuswerten(ansatz: string): number | null {
  const tokenListe = tokenisieren(ansatz.trim());
  if (!tokenListe || tokenListe.length === 0) return null;
  const tokens: Token[] = tokenListe;

  let pos = 0;

  function ausdruck(): number | null {
    let links = term();
    if (links === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.typ !== "op" || (t.wert !== "+" && t.wert !== "-")) break;
      pos++;
      const rechts = term();
      if (rechts === null) return null;
      links = t.wert === "+" ? links + rechts : links - rechts;
    }
    return links;
  }

  function term(): number | null {
    let links = faktor();
    if (links === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.typ !== "op" || (t.wert !== "*" && t.wert !== "/")) break;
      pos++;
      const rechts = faktor();
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

  function faktor(): number | null {
    const t = tokens[pos];
    if (!t) return null;
    // Vorzeichen
    if (t.typ === "op" && (t.wert === "-" || t.wert === "+")) {
      pos++;
      const f = faktor();
      if (f === null) return null;
      return t.wert === "-" ? -f : f;
    }
    if (t.typ === "zahl") {
      pos++;
      return t.wert;
    }
    if (t.typ === "auf") {
      pos++;
      const inner = ausdruck();
      if (inner === null) return null;
      const schluss = tokens[pos];
      if (!schluss || schluss.typ !== "zu") return null;
      pos++;
      return inner;
    }
    return null;
  }

  const ergebnis = ausdruck();
  if (ergebnis === null || pos !== tokens.length) return null;
  if (!Number.isFinite(ergebnis)) return null;
  return Math.round(ergebnis * 1000) / 1000; // Mengen auf 3 Nachkommastellen
}
