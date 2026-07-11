"use client";

import { useState, useTransition } from "react";
import { projektAendern, projektLoeschen } from "@/lib/actions/projekte";

export interface ProjektDaten {
  id: string;
  nummer: string;
  bezeichnung: string;
  auftraggeber: string | null;
  ort: string | null;
  anzahlLvs: number;
}

export function ProjektEinstellungen({ projekt }: { projekt: ProjektDaten }) {
  const [offen, setOffen] = useState(false);
  const [pending, startTransition] = useTransition();

  const loeschen = () => {
    const ok = window.confirm(
      `Projekt „${projekt.nummer} ${projekt.bezeichnung}" wirklich löschen?\n\n` +
        `Dabei werden ${projekt.anzahlLvs} Leistungsverzeichnis(se) samt ` +
        `Kalkulationen, Angeboten, Aufmaßen und Rechnungen unwiderruflich gelöscht.`
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await projektLoeschen(projekt.id);
      } catch {
        window.alert(
          "Das Projekt enthält gelegte Rechnungen und kann nicht gelöscht werden – bitte stattdessen den Status auf „Archiviert“ setzen."
        );
      }
    });
  };

  if (!offen) {
    return (
      <button
        onClick={() => setOffen(true)}
        className="text-xs text-slate-400 hover:text-blue-700"
        title="Projekt bearbeiten oder löschen"
      >
        ⚙ Projekt bearbeiten
      </button>
    );
  }

  return (
    <div className={`mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${pending ? "opacity-60" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">
          Projekt bearbeiten
        </h2>
        <button
          onClick={() => setOffen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Schließen
        </button>
      </div>
      <form
        action={projektAendern.bind(null, projekt.id)}
        className="flex flex-wrap items-end gap-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Projektnummer *
          </label>
          <input
            name="nummer"
            required
            defaultValue={projekt.nummer}
            className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Bezeichnung *
          </label>
          <input
            name="bezeichnung"
            required
            defaultValue={projekt.bezeichnung}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Auftraggeber
          </label>
          <input
            name="auftraggeber"
            defaultValue={projekt.auftraggeber ?? ""}
            className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Ort
          </label>
          <input
            name="ort"
            defaultValue={projekt.ort ?? ""}
            className="w-36 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
        <button className="rounded bg-blue-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-900">
          Speichern
        </button>
        <button
          type="button"
          onClick={loeschen}
          className="rounded border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Projekt löschen …
        </button>
      </form>
    </div>
  );
}
