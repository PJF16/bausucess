"use client";

import { useEffect, useState, useTransition } from "react";
import {
  lbSuchen,
  positionAusLbUebernehmen,
  type LbTreffer,
} from "@/lib/actions/leistungsbuch";

export function LbUebernahme({
  lvId,
  gruppeId,
}: {
  lvId: string;
  gruppeId: string;
}) {
  const [offen, setOffen] = useState(false);
  const [query, setQuery] = useState("");
  const [treffer, setTreffer] = useState<LbTreffer[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [suchFehler, setSuchFehler] = useState(false);
  const [uebernahmeFehler, setUebernahmeFehler] = useState<string | null>(null);
  const [uebernommen, setUebernommen] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timeout = setTimeout(async () => {
      try {
        const ergebnis = await lbSuchen(query);
        if (aktuell) setTreffer(ergebnis);
      } catch {
        if (aktuell) {
          setTreffer([]);
          setSuchFehler(true);
        }
      } finally {
        if (aktuell) setGeladen(true);
      }
    }, 200);
    return () => {
      aktuell = false;
      clearTimeout(timeout);
    };
  }, [offen, query]);

  const uebernehmen = (t: LbTreffer) => {
    setUebernahmeFehler(null);
    startTransition(async () => {
      try {
        await positionAusLbUebernehmen(lvId, gruppeId, t.id);
        setUebernommen((liste) => [...liste, t.id]);
      } catch {
        setUebernahmeFehler("Die Position konnte nicht übernommen werden. Bitte erneut versuchen.");
      }
    });
  };

  if (!offen) {
    return (
      <button
        onClick={() => {
          setOffen(true);
          setUebernommen([]);
          setGeladen(false);
          setSuchFehler(false);
          setTreffer([]);
        }}
        className="rounded border border-blue-800 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50"
        title="Stammpositionen aus dem Leistungsbuch in diese Gruppe übernehmen"
      >
        + aus Leistungsbuch
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOffen(false)}
        className="rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white"
      >
        Schließen
      </button>
      <div className="absolute right-0 top-8 z-20 w-[28rem] rounded-lg border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-100 p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setGeladen(false);
              setSuchFehler(false);
              setTreffer([]);
            }}
            placeholder="LB-HB 023 und Firmenkatalog durchsuchen …"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        {uebernahmeFehler && (
          <p role="alert" className="px-3 pt-2 text-xs text-red-600">{uebernahmeFehler}</p>
        )}
        <div className={`max-h-80 overflow-y-auto ${pending ? "opacity-60" : ""}`}>
          {!geladen && (
            <p className="p-4 text-center text-xs text-slate-400">Lade …</p>
          )}
          {geladen && suchFehler && (
            <p role="alert" className="p-4 text-center text-xs text-red-600">
              Die Suche ist fehlgeschlagen. Bitte erneut versuchen.
            </p>
          )}
          {geladen && !suchFehler && treffer.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">
              Keine passende Leistungsposition gefunden.
            </p>
          )}
          {!suchFehler && treffer.map((t) => (
            <button
              key={t.id}
              onClick={() => uebernehmen(t)}
              disabled={pending || uebernommen.includes(t.id)}
              className="block w-full border-b border-slate-50 px-3 py-1.5 text-left text-sm hover:bg-blue-50 disabled:opacity-50"
              title="In die ausgewählte LV-Gruppe übernehmen"
            >
              <span className="font-mono text-xs text-slate-500">{t.nummer}</span>{" "}
              <span className="font-medium">{t.stichwort}</span>{" "}
              <span className="text-xs text-slate-400">
                {t.einheit ? `[${t.einheit}] · ` : ""}
                {t.quelle === "LB_HB_023" ? "LB-HB 023 · " : "Firmenkatalog · "}
                {t.gruppenPfad}
              </span>
              {uebernommen.includes(t.id) && (
                <span className="ml-1 text-xs font-semibold text-green-700">
                  ✓ übernommen
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
