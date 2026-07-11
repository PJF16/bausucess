"use client";

import { useState, useTransition } from "react";
import { lvAendern, lvDuplizieren, lvLoeschen } from "@/lib/actions/projekte";
import { lvArtLabel } from "@/lib/labels";

export interface LvEinstellungenDaten {
  projektId: string;
  lvId: string;
  bezeichnung: string;
  art: string;
  ustSatz: number;
  deckungsruecklass: number;
  haftruecklass: number;
  skonto: number;
  skontoTage: number;
  anzahlPositionen: number;
}

export function LvEinstellungen({ lv }: { lv: LvEinstellungenDaten }) {
  const [offen, setOffen] = useState(false);
  const [pending, startTransition] = useTransition();

  const loeschen = () => {
    const ok = window.confirm(
      `LV „${lv.bezeichnung}" mit ${lv.anzahlPositionen} Position(en) wirklich löschen?\n\n` +
        `Kalkulation, Angebote, Aufmaße und Rechnungen dieses LV werden ebenfalls unwiderruflich gelöscht.`
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await lvLoeschen(lv.projektId, lv.lvId);
      } catch {
        window.alert(
          "Das LV enthält gelegte Rechnungen und kann nicht gelöscht werden."
        );
      }
    });
  };

  const duplizieren = () => {
    startTransition(async () => {
      await lvDuplizieren(lv.projektId, lv.lvId);
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOffen(!offen)}
        className={`rounded border px-2 py-1 text-xs ${
          offen
            ? "border-blue-800 bg-blue-800 text-white"
            : "border-slate-300 text-slate-600 hover:bg-slate-100"
        }`}
        title="LV-Einstellungen: umbenennen, duplizieren, löschen"
      >
        ⚙
      </button>
      {offen && (
        <div
          className={`absolute right-0 top-8 z-20 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg ${
            pending ? "opacity-60" : ""
          }`}
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            LV-Einstellungen
          </h3>
          <form
            action={lvAendern.bind(null, lv.projektId, lv.lvId)}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Bezeichnung *
              </label>
              <input
                name="bezeichnung"
                required
                defaultValue={lv.bezeichnung}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  LV-Art
                </label>
                <select
                  name="art"
                  defaultValue={lv.art}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {Object.entries(lvArtLabel).map(([wert, label]) => (
                    <option key={wert} value={wert}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  USt %
                </label>
                <input
                  name="ustSatz"
                  type="number"
                  step="0.01"
                  defaultValue={lv.ustSatz}
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Abrechnungskonditionen
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Deckungsrücklass %
                  </label>
                  <input
                    name="deckungsruecklass"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    defaultValue={lv.deckungsruecklass}
                    title="Einbehalt bei Teilrechnungen"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Haftrücklass %
                  </label>
                  <input
                    name="haftruecklass"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    defaultValue={lv.haftruecklass}
                    title="Einbehalt bei der Schlussrechnung (Gewährleistung)"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Skonto %
                  </label>
                  <input
                    name="skonto"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    defaultValue={lv.skonto}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Skontofrist (Tage)
                  </label>
                  <input
                    name="skontoTage"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={lv.skontoTage}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <button className="w-full rounded bg-blue-800 py-1.5 text-sm font-semibold text-white hover:bg-blue-900">
              Speichern
            </button>
          </form>
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            <button
              onClick={duplizieren}
              className="flex-1 rounded border border-blue-800 px-2 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50"
              title="Kopie inkl. Struktur, Positionen und Kalkulation anlegen"
            >
              Duplizieren
            </button>
            <button
              onClick={loeschen}
              className="flex-1 rounded border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Löschen …
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
