"use client";

import { useActionState, useState, useTransition } from "react";
import {
  benutzerAnlegen,
  benutzerEntfernen,
  rolleAendern,
} from "@/lib/actions/benutzer";

export interface Mitglied {
  membershipId: string;
  name: string;
  email: string;
  rolle: string;
  istIch: boolean;
}

const rollenLabel: Record<string, string> = {
  ADMIN: "Admin",
  BEARBEITER: "Bearbeiter",
  LESER: "Leser",
};

function MitgliedZeile({ mitglied }: { mitglied: Mitglied }) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <tr className={`border-t border-slate-100 ${pending ? "opacity-50" : ""}`}>
      <td className="px-4 py-2 font-medium">
        {mitglied.name}
        {mitglied.istIch && (
          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
            Sie
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-slate-500">{mitglied.email}</td>
      <td className="px-4 py-2">
        <select
          value={mitglied.rolle}
          onChange={(e) =>
            startTransition(async () => {
              setFehler(null);
              try {
                await rolleAendern(
                  mitglied.membershipId,
                  e.target.value as "ADMIN" | "BEARBEITER" | "LESER"
                );
              } catch {
                setFehler("Rolle konnte nicht geändert werden (letzter Admin?).");
              }
            })
          }
          className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-600 focus:outline-none"
        >
          {Object.entries(rollenLabel).map(([wert, label]) => (
            <option key={wert} value={wert}>
              {label}
            </option>
          ))}
        </select>
        {fehler && <span className="ml-2 text-xs text-red-600">{fehler}</span>}
      </td>
      <td className="px-4 py-2 text-right">
        {!mitglied.istIch && (
          <button
            onClick={() =>
              startTransition(async () => {
                await benutzerEntfernen(mitglied.membershipId);
              })
            }
            className="text-xs text-slate-400 hover:text-red-600"
          >
            Entfernen
          </button>
        )}
      </td>
    </tr>
  );
}

export function BenutzerVerwaltung({ mitglieder }: { mitglieder: Mitglied[] }) {
  const [state, formAction, pending] = useActionState(benutzerAnlegen, undefined);

  return (
    <>
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">
          Neuen Benutzer anlegen
        </h2>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Name *
            </label>
            <input
              name="name"
              required
              className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              E-Mail *
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Passwort * (min. 8 Zeichen)
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Rolle
            </label>
            <select
              name="rolle"
              defaultValue="BEARBEITER"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
            >
              {Object.entries(rollenLabel).map(([wert, label]) => (
                <option key={wert} value={wert}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={pending}
            className="rounded bg-blue-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
          >
            {pending ? "Anlegen …" : "Anlegen"}
          </button>
        </form>
        {state?.error && (
          <p className="mt-2 text-sm text-red-600">{state.error}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">E-Mail</th>
              <th className="px-4 py-2">Rolle</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {mitglieder.map((m) => (
              <MitgliedZeile key={m.membershipId} mitglied={m} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Hinweis: Rollenänderungen werden beim nächsten Login des betroffenen
        Benutzers wirksam.
      </p>
    </>
  );
}
