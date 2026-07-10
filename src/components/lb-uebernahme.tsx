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
  const [uebernommen, setUebernommen] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!offen) return;
    const timeout = setTimeout(() => {
      lbSuchen(query).then((ergebnis) => {
        setTreffer(ergebnis);
        setGeladen(true);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [offen, query]);

  const uebernehmen = (t: LbTreffer) => {
    startTransition(async () => {
      await positionAusLbUebernehmen(lvId, gruppeId, t.id);
      setUebernommen((liste) => [...liste, t.id]);
    });
  };

  if (!offen) {
    return (
      <button
        onClick={() => {
          setOffen(true);
          setUebernommen([]);
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Leistungsbuch durchsuchen …"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div className={`max-h-80 overflow-y-auto ${pending ? "opacity-60" : ""}`}>
          {!geladen && (
            <p className="p-4 text-center text-xs text-slate-400">Lade …</p>
          )}
          {geladen && treffer.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-400">
              Keine Stammpositionen gefunden – pflegen Sie den Katalog unter
              „Leistungsbuch&ldquo;.
            </p>
          )}
          {treffer.map((t) => (
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
                [{t.einheit}] · {t.gruppenPfad}
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
