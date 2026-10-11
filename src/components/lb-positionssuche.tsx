"use client";

import { useEffect, useId, useRef, useState } from "react";
import { lbSuchen, type LbTreffer } from "@/lib/actions/leistungsbuch";

export function LbPositionssuche({
  value,
  onChange,
  onAuswahl,
  onFreieEingabe,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onAuswahl: (position: LbTreffer) => void;
  onFreieEingabe: () => void;
  className: string;
}) {
  const listenId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [offen, setOffen] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [treffer, setTreffer] = useState<LbTreffer[]>([]);
  const [aktiv, setAktiv] = useState(-1);
  const [fehler, setFehler] = useState(false);
  const suchbegriffDerTreffer = useRef<string | null>(null);

  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    const timeout = window.setTimeout(async () => {
      try {
        const ergebnis = await lbSuchen(value);
        if (!aktuell) return;
        setTreffer(ergebnis);
        setAktiv(ergebnis.length > 0 ? 0 : -1);
        suchbegriffDerTreffer.current = value;
      } catch {
        if (!aktuell) return;
        setTreffer([]);
        setAktiv(-1);
        suchbegriffDerTreffer.current = null;
        setFehler(true);
      } finally {
        if (aktuell) setGeladen(true);
      }
    }, 180);
    return () => {
      aktuell = false;
      window.clearTimeout(timeout);
    };
  }, [offen, value]);

  const auswaehlen = (position: LbTreffer) => {
    onAuswahl(position);
    setOffen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listenId}
        aria-expanded={offen}
        aria-activedescendant={
          offen && aktiv >= 0 ? `${listenId}-${aktiv}` : undefined
        }
        className={className}
        placeholder="Leistungsposition suchen oder frei eingeben …"
        value={value}
        onFocus={() => {
          if (!offen) {
            setGeladen(false);
            setFehler(false);
            setTreffer([]);
            setAktiv(-1);
            suchbegriffDerTreffer.current = null;
          }
          setOffen(true);
        }}
        onChange={(event) => {
          suchbegriffDerTreffer.current = null;
          setTreffer([]);
          setAktiv(-1);
          setGeladen(false);
          setFehler(false);
          onChange(event.target.value);
          setOffen(true);
        }}
        onBlur={(event) => {
          const ziel = event.relatedTarget;
          if (!(ziel instanceof Node && event.currentTarget.parentElement?.contains(ziel))) {
            setOffen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && offen && treffer.length > 0) {
            event.preventDefault();
            setAktiv((index) => (index + 1) % treffer.length);
          } else if (event.key === "ArrowUp" && offen && treffer.length > 0) {
            event.preventDefault();
            setAktiv((index) => (index <= 0 ? treffer.length - 1 : index - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (
              offen && geladen && !fehler && suchbegriffDerTreffer.current === value &&
              aktiv >= 0 && treffer[aktiv]
            ) {
              auswaehlen(treffer[aktiv]);
            } else {
              onFreieEingabe();
            }
          } else if (event.key === "Escape") {
            setOffen(false);
          }
        }}
      />
      {offen && (
        <div
          id={listenId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-80 w-[36rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {!geladen && (
            <p className="p-3 text-center text-xs text-slate-400">Suche …</p>
          )}
          {geladen && fehler && (
            <p className="p-3 text-center text-xs text-red-600">
              Die Suche ist fehlgeschlagen. Bitte erneut versuchen.
            </p>
          )}
          {geladen && !fehler && treffer.length === 0 && (
            <p className="p-3 text-center text-xs text-slate-400">
              Keine passende Position gefunden. Der eingegebene Text kann als
              freie Position verwendet werden.
            </p>
          )}
          {geladen && !fehler && treffer.map((position, index) => (
            <button
              id={`${listenId}-${index}`}
              role="option"
              aria-selected={aktiv === index}
              key={position.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setAktiv(index)}
              onClick={() => auswaehlen(position)}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${
                aktiv === index ? "bg-blue-50" : "bg-white"
              }`}
            >
              <span className="font-mono text-xs font-semibold text-blue-800">
                {position.nummer}
              </span>{" "}
              <span className="text-sm font-medium text-slate-800">
                {position.stichwort}
              </span>
              {position.einheit && (
                <span className="ml-1 text-xs text-slate-500">
                  [{position.einheit}]
                </span>
              )}
              <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                {position.quelle === "LB_HB_023" ? "LB-HB 023 · " : "Firmenkatalog · "}
                {position.gruppenPfad}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
