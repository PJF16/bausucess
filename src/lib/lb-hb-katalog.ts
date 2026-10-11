import katalogJson from "../../data/lb-hb-023.json";

export interface StandardPosition {
  nummer: string;
  stichwort: string;
  einheit: string;
  langtext: string;
  gruppenPfad: string;
}

interface KatalogEintrag {
  n: string;
  s: string;
  e: string;
  l: string;
  g: string;
}

const katalog = katalogJson as KatalogEintrag[];
const nachNummer = new Map(katalog.map((position) => [position.n, position]));

function normalisieren(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT");
}

const suchIndex = katalog.map((position) => ({
  position,
  text: normalisieren(`${position.n} ${position.s} ${position.g}`),
  stichwort: normalisieren(position.s),
}));

function ausgeben(position: KatalogEintrag): StandardPosition {
  return {
    nummer: position.n,
    stichwort: position.s,
    einheit: position.e,
    langtext: position.l,
    gruppenPfad: position.g,
  };
}

export function standardPositionSuchen(query: string, limit = 30) {
  const q = normalisieren(query.trim());
  if (!q) return katalog.slice(0, limit).map(ausgeben);

  const teile = q.split(/\s+/).filter(Boolean);
  return suchIndex
    .filter(({ text }) => teile.every((teil) => text.includes(teil)))
    .sort((a, b) => {
      const aNummer = a.position.n.toLocaleLowerCase().startsWith(q);
      const bNummer = b.position.n.toLocaleLowerCase().startsWith(q);
      if (aNummer !== bNummer) return aNummer ? -1 : 1;
      const aStichwort = a.stichwort.startsWith(q);
      const bStichwort = b.stichwort.startsWith(q);
      if (aStichwort !== bStichwort) return aStichwort ? -1 : 1;
      return a.position.n.localeCompare(b.position.n, "de-AT");
    })
    .slice(0, limit)
    .map(({ position }) => ausgeben(position));
}

export function standardPositionNachNummer(nummer: string) {
  const position = nachNummer.get(nummer);
  return position ? ausgeben(position) : null;
}
