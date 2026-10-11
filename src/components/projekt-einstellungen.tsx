"use client";

import { useState, useTransition } from "react";
import { projektAendernMitRueckmeldung, projektLoeschen } from "@/lib/actions/projekte";

export interface ProjektDaten {
  id: string;
  nummer: string;
  bezeichnung: string;
  auftraggeber: string | null;
  ort: string | null;
  status: "AKTIV" | "ABGESCHLOSSEN" | "ARCHIVIERT";
  anzahlLvs: number;
}

export function ProjektEinstellungen({ projekt }: { projekt: ProjektDaten }) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [pending, startTransition] = useTransition();

  const speichern = (formData: FormData) => {
    setFehler("");
    startTransition(async () => {
      try {
        const ergebnis = await projektAendernMitRueckmeldung(projekt.id, formData);
        if (ergebnis.error) setFehler(ergebnis.error);
        else setOffen(false);
      } catch (error) {
        setFehler(error instanceof Error ? error.message : "Projekt konnte nicht gespeichert werden.");
      }
    });
  };

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
          "Das Projekt enthält möglicherweise gelegte Rechnungen oder Vertrags-LVs und kann nicht gelöscht werden. Bitte setzen Sie den Status auf „Archiviert“."
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
      <form action={speichern} className="flex flex-wrap items-end gap-3">
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
        <div>
          <label htmlFor="projekt-status" className="mb-1 block text-xs font-medium text-slate-500">
            Status
          </label>
          <select
            id="projekt-status"
            name="status"
            defaultValue={projekt.status}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
          >
            <option value="AKTIV">Aktiv</option>
            <option value="ABGESCHLOSSEN">Abgeschlossen</option>
            <option value="ARCHIVIERT">Archiviert</option>
          </select>
        </div>
        {fehler && <p role="alert" className="w-full text-sm text-red-700">{fehler}</p>}
        <button disabled={pending} className="rounded bg-blue-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50">
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
