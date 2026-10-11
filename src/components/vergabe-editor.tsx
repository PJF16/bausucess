"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  angebotEntfernen,
  angebotspreisAendern,
  bieterEinladen,
  zuschlagErteilen,
  zuschlagZurueckziehen,
  vertragsLvErzeugen,
} from "@/lib/actions/vergabe";

export interface VergabeGruppe {
  id: string;
  parentId: string | null;
  ebene: string;
  nummer: string;
  bezeichnung: string;
}

export interface VergabePosition {
  id: string;
  gruppeId: string;
  nummer: string;
  stichwort: string;
  einheit: string;
  menge: number;
  art: string;
  epEigen: number;
}

export interface VergabeAngebot {
  id: string;
  bieterId: string;
  firma: string;
  status: string;
  vertragsLvId: string | null;
  preise: Record<string, number>;
}

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const statusLabel: Record<string, string> = {
  EINGELADEN: "Eingeladen",
  ABGEGEBEN: "Angebot liegt vor",
  AUSGESCHIEDEN: "Ausgeschieden",
  ZUSCHLAG: "Zuschlag",
};

const statusFarbe: Record<string, string> = {
  EINGELADEN: "bg-slate-100 text-slate-600",
  ABGEGEBEN: "bg-blue-100 text-blue-800",
  AUSGESCHIEDEN: "bg-red-100 text-red-700",
  ZUSCHLAG: "bg-green-100 text-green-800",
};

function positionZaehlt(art: string) {
  return art !== "EVENTUAL" && art !== "ALTERNATIV";
}

// ── Kopfbereich: Bieterliste, Einladung, Zuschlag ───────────────────

function VergabeKopf({
  projektId,
  lvId,
  angebote,
  verfuegbareBieter,
  summen,
  fehlend,
  readonly,
  ausfuehren,
}: {
  projektId: string;
  lvId: string;
  angebote: VergabeAngebot[];
  verfuegbareBieter: { id: string; firma: string }[];
  summen: Map<string, number>;
  fehlend: Map<string, number>;
  readonly: boolean;
  ausfuehren: (aktion: () => Promise<unknown>) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [auswahl, setAuswahl] = useState("");

  // Nur vollständig ausgepreiste Angebote kommen für „günstigstes" infrage
  const guenstigsteId = useMemo(() => {
    let besteId: string | null = null;
    let besterWert = Infinity;
    for (const a of angebote) {
      if ((fehlend.get(a.id) ?? 0) > 0) continue;
      const summe = summen.get(a.id) ?? 0;
      if (summe > 0 && summe < besterWert) {
        besterWert = summe;
        besteId = a.id;
      }
    }
    return besteId;
  }, [angebote, summen, fehlend]);

  const zuschlag = angebote.find((a) => a.status === "ZUSCHLAG");

  return (
    <div className={`border-b border-slate-200 bg-white px-4 py-2 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Bieter
        </span>
        {angebote.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${statusFarbe[a.status]}`}
          >
            <span className="font-medium">{a.firma}</span>
            {a.id === guenstigsteId && a.status !== "ZUSCHLAG" && (
              <span title="Günstigstes vollständiges Angebot">★</span>
            )}
            {(fehlend.get(a.id) ?? 0) > 0 && (
              <span
                className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800"
                title={`${fehlend.get(a.id)} Positionen ohne Preis – Angebotssumme nicht vergleichbar`}
              >
                ⚠ {fehlend.get(a.id)} o. Preis
              </span>
            )}
            <span className="opacity-70">{statusLabel[a.status]}</span>
            {a.vertragsLvId && <span className="rounded bg-green-200 px-1 text-[10px] text-green-900">Vertrag</span>}
            {!readonly &&
              (a.status === "ZUSCHLAG" ? (
                !a.vertragsLvId && <button
                  onClick={() =>
                    startTransition(() => ausfuehren(() => zuschlagZurueckziehen(lvId, a.id)))
                  }
                  className="ml-1 underline decoration-dotted hover:opacity-70"
                  title="Zuschlag zurückziehen"
                >
                  zurückziehen
                </button>
              ) : (
                <button
                  disabled={a.status !== "ABGEGEBEN"}
                  onClick={() =>
                    startTransition(() => ausfuehren(() => zuschlagErteilen(lvId, a.id)))
                  }
                  className="ml-1 underline decoration-dotted hover:opacity-70"
                  title="Zuschlag erteilen"
                >
                  Zuschlag
                </button>
              ))}
            {!readonly && a.status !== "ZUSCHLAG" && !a.vertragsLvId && (
              <button
                onClick={() =>
                  startTransition(() => ausfuehren(() => angebotEntfernen(lvId, a.id)))
                }
                className="ml-0.5 opacity-50 hover:opacity-100"
                title="Bieter aus dieser Ausschreibung entfernen"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {!readonly &&
            (verfuegbareBieter.length > 0 ? (
              <>
                <select
                  value={auswahl}
                  onChange={(e) => setAuswahl(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Bieter einladen …</option>
                  {verfuegbareBieter.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.firma}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!auswahl}
                  onClick={() =>
                    startTransition(async () => ausfuehren(async () => {
                      await bieterEinladen(lvId, auswahl);
                      setAuswahl("");
                    }))
                  }
                  className="rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  Einladen
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">Alle Bieter bereits eingeladen</span>
            ))}
          <Link href="/bieter" className="text-xs text-blue-700 hover:underline">
            Bieter verwalten
          </Link>
        </div>
      </div>

      {zuschlag && (
        <div className="mt-2 flex items-center gap-2 rounded bg-green-50 px-3 py-1.5 text-xs text-green-900">
          <span>
            Zuschlag erteilt an <strong>{zuschlag.firma}</strong> ·{" "}
            {euro.format(summen.get(zuschlag.id) ?? 0)}
          </span>
          {!readonly && !zuschlag.vertragsLvId && (
            <button
              onClick={() =>
                startTransition(() => ausfuehren(() => vertragsLvErzeugen(lvId, zuschlag.id)))
              }
              className="ml-auto rounded bg-green-700 px-2 py-1 font-semibold text-white hover:bg-green-800"
            >
              Vertrags-LV erzeugen
            </button>
          )}
          {zuschlag.vertragsLvId && (
            <Link href={`/projekte/${projektId}/lv/${zuschlag.vertragsLvId}`} className="ml-auto rounded bg-green-700 px-2 py-1 font-semibold text-white hover:bg-green-800">
              Vertrags-LV öffnen
            </Link>
          )}
        </div>
      )}
      {zuschlag && <p className="mt-1 text-[11px] text-slate-500">Im Vertrags-LV werden nicht bepreiste Eventual- und Alternativpositionen mit €0,00 übernommen.</p>}
    </div>
  );
}

// ── Editierbare Preiszelle ───────────────────────────────────────────

function PreisZelle({
  lvId,
  angebotId,
  positionId,
  ep,
  istMinimum,
  readonly,
  ausfuehren,
}: {
  lvId: string;
  angebotId: string;
  positionId: string;
  ep: number;
  istMinimum: boolean;
  readonly: boolean;
  ausfuehren: (aktion: () => Promise<unknown>) => Promise<void>;
}) {
  const [wert, setWert] = useState(ep);
  const [pending, startTransition] = useTransition();

  const speichern = () => {
    if (wert === ep || readonly) return;
    startTransition(() => ausfuehren(() => angebotspreisAendern(lvId, angebotId, positionId, wert)));
  };

  return (
    <input
      type="number"
      step="0.01"
      value={wert || ""}
      placeholder="–"
      disabled={readonly}
      onChange={(e) => setWert(Number(e.target.value))}
      onBlur={speichern}
      className={`w-full rounded border-0 px-1.5 py-0.5 text-right font-mono text-xs focus:outline focus:outline-1 focus:outline-blue-500 ${
        pending
          ? "bg-slate-100 opacity-50"
          : istMinimum && wert > 0
            ? "bg-green-50 font-semibold text-green-800"
            : "bg-transparent"
      }`}
    />
  );
}

// ── Editor ──────────────────────────────────────────────────────────

export function VergabeEditor({
  projektId,
  lvId,
  gruppen,
  positionen,
  angebote,
  verfuegbareBieter,
  darfBearbeiten,
}: {
  projektId: string;
  lvId: string;
  gruppen: VergabeGruppe[];
  positionen: VergabePosition[];
  angebote: VergabeAngebot[];
  verfuegbareBieter: { id: string; firma: string }[];
  darfBearbeiten: boolean;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const ausfuehren = async (aktion: () => Promise<unknown>) => {
    setFehler(null);
    try {
      await aktion();
    } catch (error) {
      const digest = (error as { digest?: string })?.digest;
      if (digest?.startsWith("NEXT_REDIRECT")) throw error;
      setFehler(error instanceof Error ? error.message : "Aktion fehlgeschlagen");
    }
  };
  // Zeilenreihenfolge: Gruppenüberschriften mit eingerückten Positionen
  const zeilen = useMemo(() => {
    const tiefen = new Map<string, number>();
    const tiefe = (g: VergabeGruppe): number => {
      if (tiefen.has(g.id)) return tiefen.get(g.id)!;
      const parent = gruppen.find((x) => x.id === g.parentId);
      const t = parent ? tiefe(parent) + 1 : 0;
      tiefen.set(g.id, t);
      return t;
    };
    const liste: Array<
      | { typ: "gruppe"; gruppe: VergabeGruppe; tiefe: number }
      | { typ: "position"; position: VergabePosition; tiefe: number }
    > = [];
    const rekursiv = (parentId: string | null) => {
      for (const g of gruppen.filter((x) => x.parentId === parentId)) {
        const posInGruppe = positionen.filter((p) => p.gruppeId === g.id);
        if (posInGruppe.length > 0 || gruppen.some((x) => x.parentId === g.id)) {
          liste.push({ typ: "gruppe", gruppe: g, tiefe: tiefe(g) });
          for (const p of posInGruppe) {
            liste.push({ typ: "position", position: p, tiefe: tiefe(g) + 1 });
          }
        }
        rekursiv(g.id);
      }
    };
    rekursiv(null);
    return liste;
  }, [gruppen, positionen]);

  // Summe je Angebot (Positionen mit Menge, ohne Eventual/Alternativ; fehlende Preise zählen als 0)
  const summen = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of angebote) {
      let summe = 0;
      for (const p of positionen) {
        if (!positionZaehlt(p.art)) continue;
        const ep = a.preise[p.id] ?? 0;
        summe += p.menge * ep;
      }
      map.set(a.id, summe);
    }
    return map;
  }, [angebote, positionen]);

  // Unvollständig ausgepreiste Angebote: ihre Summe ist künstlich zu niedrig
  // und darf nicht als „günstigstes Angebot" gewertet werden.
  const fehlendJeAngebot = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of angebote) {
      let fehlt = 0;
      for (const p of positionen) {
        if (!positionZaehlt(p.art)) continue;
        if (!((a.preise[p.id] ?? 0) > 0)) fehlt++;
      }
      map.set(a.id, fehlt);
    }
    return map;
  }, [angebote, positionen]);

  // Je Position: günstigster (nicht-null) Preis über alle Bieter, für Hervorhebung
  const minJePosition = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positionen) {
      let min = Infinity;
      for (const a of angebote) {
        const ep = a.preise[p.id] ?? 0;
        if (ep > 0 && ep < min) min = ep;
      }
      if (min < Infinity) map.set(p.id, min);
    }
    return map;
  }, [angebote, positionen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VergabeKopf
        projektId={projektId}
        lvId={lvId}
        angebote={angebote}
        verfuegbareBieter={verfuegbareBieter}
        summen={summen}
        fehlend={fehlendJeAngebot}
        readonly={!darfBearbeiten}
        ausfuehren={ausfuehren}
      />

      {fehler && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{fehler}</p>}

      {angebote.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">
          Noch keine Bieter eingeladen – wählen Sie oben einen Bieter aus, um mit
          dem Preisspiegel zu beginnen.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="min-w-16 px-1 py-1.5">Pos.-Nr.</th>
                <th className="min-w-56 px-1 py-1.5">Stichwort</th>
                <th className="min-w-16 px-1 py-1.5 text-right">Menge</th>
                <th className="min-w-10 px-1 py-1.5 text-center">ME</th>
                {angebote.map((a) => (
                  <th key={a.id} className="min-w-24 px-1 py-1.5 text-right">
                    {a.firma}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {zeilen.map((zeile) =>
                zeile.typ === "gruppe" ? (
                  <tr key={zeile.gruppe.id} className="bg-slate-50">
                    <td
                      colSpan={4 + angebote.length}
                      className="px-1 py-1 text-xs font-semibold text-slate-500"
                      style={{ paddingLeft: `${zeile.tiefe * 14 + 4}px` }}
                    >
                      {zeile.gruppe.nummer} {zeile.gruppe.bezeichnung}
                    </td>
                  </tr>
                ) : (
                  <tr key={zeile.position.id} className="border-t border-slate-100">
                    <td className="px-1 py-0.5 font-mono text-xs text-slate-500">
                      {zeile.position.nummer}
                    </td>
                    <td
                      className="truncate px-1 py-0.5"
                      style={{ paddingLeft: `${zeile.tiefe * 14}px` }}
                      title={zeile.position.stichwort}
                    >
                      {zeile.position.stichwort}
                      {!positionZaehlt(zeile.position.art) && (
                        <span className="ml-1 text-[10px] text-amber-600">
                          ({zeile.position.art === "EVENTUAL" ? "Eventual" : "Alternativ"})
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-0.5 text-right font-mono text-xs">
                      {zahl.format(zeile.position.menge)}
                    </td>
                    <td className="px-1 py-0.5 text-center text-xs text-slate-500">
                      {zeile.position.einheit}
                    </td>
                    {angebote.map((a) => (
                      <td key={a.id} className="px-0.5 py-0.5">
                        <PreisZelle
                          lvId={lvId}
                          angebotId={a.id}
                          positionId={zeile.position.id}
                          ep={a.preise[zeile.position.id] ?? 0}
                          istMinimum={
                            (a.preise[zeile.position.id] ?? 0) ===
                            minJePosition.get(zeile.position.id)
                          }
                          readonly={!darfBearbeiten || a.status === "ZUSCHLAG" || Boolean(a.vertragsLvId)}
                          ausfuehren={ausfuehren}
                        />
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
            <tfoot className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td colSpan={4} className="px-1 py-1.5 text-right text-xs font-semibold text-slate-600">
                  Angebotssumme (netto)
                </td>
                {angebote.map((a) => {
                  const summe = summen.get(a.id) ?? 0;
                  const minSumme = Math.min(
                    ...angebote.map((x) => summen.get(x.id) ?? Infinity).filter((s) => s > 0)
                  );
                  return (
                    <td
                      key={a.id}
                      className={`px-1.5 py-1.5 text-right font-mono text-xs font-bold ${
                        summe > 0 && summe === minSumme ? "text-green-700" : "text-slate-700"
                      }`}
                    >
                      {euro.format(summe)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
