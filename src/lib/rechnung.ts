// Rechenlogik für Rechnungen (Teil- und Schlussrechnung nach ÖNORM-B-2110-
// Praxis). Wird beim Legen (Snapshot) und bei der Anzeige identisch
// verwendet, damit Dokument und gespeicherte Beträge nie auseinanderlaufen.
//
// Teilrechnung:    Leistungssumme − Deckungsrücklass + USt = Zahlbetrag
// Schlussrechnung: kumulierte Gesamtleistung − Haftrücklass + USt
//                  − bereits verrechnete Teilrechnungen (brutto) = Zahlbetrag
//                  (der Deckungsrücklass der Teilrechnungen ist damit aufgelöst)

import { runde2 } from "@/lib/kalk";

export interface RechnungsKonditionen {
  ruecklassSatz: number; // Deckungsrücklass (TR) bzw. Haftrücklass (SR) in %
  ustSatz: number;
  skontoSatz: number;
  skontoTage: number;
}

export interface RechnungsSummen {
  netto: number; // TR: Leistungssumme der Rechnung; SR: kumulierte Gesamtleistung
  ruecklassBetrag: number;
  zwischensumme: number;
  ustBetrag: number;
  brutto: number; // TR: Zahlbetrag; SR: kumulierter Bruttobetrag
  bereitsVerrechnet: number; // nur SR: Summe der Zahlbeträge der Teilrechnungen
  zahlbetrag: number; // brutto − bereitsVerrechnet
  skontoBetrag: number; // Skonto auf den Zahlbetrag
}

/** Alle Folgebeträge aus Netto, Konditionen und bereits Verrechnetem. */
export function rechnungsSummen(
  netto: number,
  kond: RechnungsKonditionen,
  bereitsVerrechnet = 0
): RechnungsSummen {
  const nettoR = runde2(netto);
  const ruecklassBetrag = runde2((nettoR * kond.ruecklassSatz) / 100);
  const zwischensumme = runde2(nettoR - ruecklassBetrag);
  const ustBetrag = runde2((zwischensumme * kond.ustSatz) / 100);
  const brutto = runde2(zwischensumme + ustBetrag);
  const verrechnetR = runde2(bereitsVerrechnet);
  const zahlbetrag = runde2(brutto - verrechnetR);
  const skontoBetrag = runde2((zahlbetrag * kond.skontoSatz) / 100);
  return {
    netto: nettoR,
    ruecklassBetrag,
    zwischensumme,
    ustBetrag,
    brutto,
    bereitsVerrechnet: verrechnetR,
    zahlbetrag,
    skontoBetrag,
  };
}

export interface PositionsBlock {
  menge: number;
  ep: number;
}

/** Leistungssumme: jeder Positionsbetrag auf Cent gerundet, dann summiert. */
export function nettoAusBloecken(bloecke: PositionsBlock[]): number {
  return runde2(bloecke.reduce((acc, b) => acc + runde2(b.menge * b.ep), 0));
}
