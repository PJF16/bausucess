"use client";

import { useState, useTransition } from "react";
import {
  nachtragAblehnen,
  nachtragAnlegen,
  nachtragBeauftragen,
  nachtragLoeschen,
  nachtragWiedereroeffnen,
  ntPositionAendern,
  ntPositionAnlegen,
  ntPositionLoeschen,
  type NtPositionsDaten,
} from "@/lib/actions/nachtraege";

export interface NtPosition {
  id: string;
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
  menge: number;
  epLohn: number;
  epSonstiges: number;
}

export interface NachtragDaten {
  id: string;
  nummer: number;
  bezeichnung: string;
  status: string;
  beauftragtAm: string | null;
  positionen: NtPosition[];
}

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

const statusLabel: Record<string, string> = {
  ANGEBOTEN: "Angeboten",
  BEAUFTRAGT: "Beauftragt",
  ABGELEHNT: "Abgelehnt",
};

const statusFarbe: Record<string, string> = {
  ANGEBOTEN: "bg-amber-100 text-amber-800",
  BEAUFTRAGT: "bg-green-100 text-green-800",
  ABGELEHNT: "bg-red-100 text-red-700",
};

function summe(positionen: NtPosition[]): number {
  return positionen.reduce(
    (acc, p) => acc + p.menge * (p.epLohn + p.epSonstiges),
    0
  );
}

// ── Positionszeile ──────────────────────────────────────────────────

function NtZeile({
  lvId,
  nachtragId,
  pos,
  gesperrt,
}: {
  lvId: string;
  nachtragId: string;
  pos: NtPosition;
  gesperrt: boolean;
}) {
  const [entwurf, setEntwurf] = useState(pos);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(entwurf) !== JSON.stringify(pos);

  const speichern = () => {
    if (!dirty || gesperrt) return;
    startTransition(async () => {
      await ntPositionAendern(lvId, nachtragId, pos.id, {
        nummer: entwurf.nummer,
        stichwort: entwurf.stichwort,
        einheit: entwurf.einheit,
        menge: entwurf.menge,
        epLohn: entwurf.epLohn,
        epSonstiges: entwurf.epSonstiges,
      });
    });
  };

  const inputCls = `w-full border-0 bg-transparent px-1 py-0.5 text-sm rounded ${
    gesperrt
      ? "text-slate-400"
      : "focus:bg-white focus:outline focus:outline-1 focus:outline-blue-500"
  }`;
  const betrag = entwurf.menge * (entwurf.epLohn + entwurf.epSonstiges);

  return (
    <tr className={`border-t border-slate-100 ${pending ? "opacity-50" : ""}`}>
      <td className="w-20">
        <input
          className={inputCls + " font-mono text-xs"}
          value={entwurf.nummer}
          disabled={gesperrt}
          onChange={(e) => setEntwurf({ ...entwurf, nummer: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td>
        <input
          className={inputCls}
          value={entwurf.stichwort}
          disabled={gesperrt}
          onChange={(e) => setEntwurf({ ...entwurf, stichwort: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        <input
          type="number"
          step="0.001"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.menge}
          disabled={gesperrt}
          onChange={(e) =>
            setEntwurf({ ...entwurf, menge: Number(e.target.value) })
          }
          onBlur={speichern}
        />
      </td>
      <td className="w-16">
        <input
          className={inputCls + " text-center text-xs"}
          value={entwurf.einheit}
          disabled={gesperrt}
          onChange={(e) => setEntwurf({ ...entwurf, einheit: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        <input
          type="number"
          step="0.01"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.epLohn}
          disabled={gesperrt}
          onChange={(e) =>
            setEntwurf({ ...entwurf, epLohn: Number(e.target.value) })
          }
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        <input
          type="number"
          step="0.01"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.epSonstiges}
          disabled={gesperrt}
          onChange={(e) =>
            setEntwurf({ ...entwurf, epSonstiges: Number(e.target.value) })
          }
          onBlur={speichern}
        />
      </td>
      <td className="w-28 px-1 text-right font-mono text-xs font-semibold">
        {zahl.format(betrag)}
      </td>
      <td className="w-8 text-center">
        {!gesperrt && (
          <button
            title="Position löschen"
            className="text-slate-300 hover:text-red-600"
            onClick={() =>
              startTransition(async () => {
                await ntPositionLoeschen(lvId, nachtragId, pos.id);
              })
            }
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Neue Position ───────────────────────────────────────────────────

const leerePosition: NtPositionsDaten = {
  nummer: "",
  stichwort: "",
  langtext: "",
  einheit: "m²",
  menge: 0,
  epLohn: 0,
  epSonstiges: 0,
};

function NeueNtZeile({
  lvId,
  nachtragId,
}: {
  lvId: string;
  nachtragId: string;
}) {
  const [entwurf, setEntwurf] = useState(leerePosition);
  const [pending, startTransition] = useTransition();

  const anlegen = () => {
    if (!entwurf.nummer.trim() || !entwurf.stichwort.trim()) return;
    startTransition(async () => {
      await ntPositionAnlegen(lvId, nachtragId, entwurf);
      setEntwurf(leerePosition);
    });
  };

  const inputCls =
    "w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <tr className={`border-t-2 border-slate-200 bg-slate-50 ${pending ? "opacity-50" : ""}`}>
      <td className="w-20 p-1">
        <input
          className={inputCls + " font-mono text-xs"}
          placeholder="Nr."
          value={entwurf.nummer}
          onChange={(e) => setEntwurf({ ...entwurf, nummer: e.target.value })}
        />
      </td>
      <td className="p-1">
        <input
          className={inputCls}
          placeholder="Stichwort der Nachtragsposition …"
          value={entwurf.stichwort}
          onChange={(e) => setEntwurf({ ...entwurf, stichwort: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
      </td>
      <td className="w-24 p-1">
        <input
          type="number"
          step="0.001"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.menge}
          onChange={(e) => setEntwurf({ ...entwurf, menge: Number(e.target.value) })}
        />
      </td>
      <td className="w-16 p-1">
        <input
          className={inputCls + " text-center text-xs"}
          value={entwurf.einheit}
          onChange={(e) => setEntwurf({ ...entwurf, einheit: e.target.value })}
        />
      </td>
      <td className="w-24 p-1">
        <input
          type="number"
          step="0.01"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.epLohn}
          onChange={(e) => setEntwurf({ ...entwurf, epLohn: Number(e.target.value) })}
        />
      </td>
      <td className="w-24 p-1">
        <input
          type="number"
          step="0.01"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.epSonstiges}
          onChange={(e) =>
            setEntwurf({ ...entwurf, epSonstiges: Number(e.target.value) })
          }
        />
      </td>
      <td />
      <td className="w-8 p-1 text-center">
        <button
          title="Position anlegen"
          onClick={anlegen}
          className="rounded bg-blue-800 px-2 py-0.5 text-xs font-bold text-white hover:bg-blue-900"
        >
          +
        </button>
      </td>
    </tr>
  );
}

// ── Editor ──────────────────────────────────────────────────────────

export function NachtragEditor({
  lvId,
  nachtraege,
  darfBearbeiten,
}: {
  lvId: string;
  nachtraege: NachtragDaten[];
  darfBearbeiten: boolean;
}) {
  const [auswahlId, setAuswahlId] = useState<string | null>(
    nachtraege[0]?.id ?? null
  );
  const [neuBezeichnung, setNeuBezeichnung] = useState("");
  const [pending, startTransition] = useTransition();

  const auswahl = nachtraege.find((n) => n.id === auswahlId) ?? null;
  const gesperrt = !darfBearbeiten || auswahl?.status !== "ANGEBOTEN";

  const anlegen = () => {
    if (!neuBezeichnung.trim()) return;
    startTransition(async () => {
      await nachtragAnlegen(lvId, neuBezeichnung);
      setNeuBezeichnung("");
    });
  };

  const beauftragen = () => {
    if (!auswahl) return;
    const ok = window.confirm(
      `Nachtrag ${auswahl.nummer} „${auswahl.bezeichnung}" beauftragen?\n\n` +
        `Die ${auswahl.positionen.length} Position(en) werden als Gruppe ` +
        `„NT${auswahl.nummer}" ins LV übernommen. Das kann nicht rückgängig gemacht werden.`
    );
    if (!ok) return;
    startTransition(async () => {
      await nachtragBeauftragen(lvId, auswahl.id);
    });
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Linke Spalte: Nachtragsliste */}
      <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nachträge
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {nachtraege.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-400">
              Noch keine Nachträge – legen Sie unten den ersten an.
            </p>
          )}
          {nachtraege.map((n) => (
            <div
              key={n.id}
              onClick={() => setAuswahlId(n.id)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
                auswahlId === n.id
                  ? "bg-blue-100 font-semibold text-blue-900"
                  : "hover:bg-slate-100"
              }`}
            >
              <span className="font-mono text-xs text-slate-500">
                NT{n.nummer}
              </span>
              <span className="flex-1 truncate">{n.bezeichnung}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusFarbe[n.status]}`}
              >
                {statusLabel[n.status]}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {euro.format(summe(n.positionen))}
              </span>
            </div>
          ))}
        </div>
        {darfBearbeiten && (
          <div className={`border-t border-slate-200 p-3 ${pending ? "opacity-50" : ""}`}>
            <div className="flex gap-2">
              <input
                placeholder="Neuer Nachtrag (Bezeichnung) …"
                value={neuBezeichnung}
                onChange={(e) => setNeuBezeichnung(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anlegen()}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-600 focus:outline-none"
              />
              <button
                onClick={anlegen}
                disabled={!neuBezeichnung.trim()}
                className="rounded bg-blue-800 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
              >
                + Nachtrag
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Rechte Spalte: Positionen des Nachtrags */}
      <section className="flex min-w-0 flex-1 flex-col">
        {auswahl ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
              <div className="text-sm font-semibold">
                NT{auswahl.nummer} {auswahl.bezeichnung}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusFarbe[auswahl.status]}`}
                >
                  {statusLabel[auswahl.status]}
                </span>
                {auswahl.beauftragtAm && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    beauftragt am {auswahl.beauftragtAm}
                  </span>
                )}
              </div>
              {darfBearbeiten && (
                <div className="flex gap-2">
                  {auswahl.status === "ANGEBOTEN" && (
                    <>
                      <button
                        onClick={beauftragen}
                        disabled={pending || auswahl.positionen.length === 0}
                        className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-40"
                        title="Positionen als Gruppe NT ins LV übernehmen"
                      >
                        Beauftragen …
                      </button>
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await nachtragAblehnen(lvId, auswahl.id);
                          })
                        }
                        disabled={pending}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Ablehnen
                      </button>
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await nachtragLoeschen(lvId, auswahl.id);
                            setAuswahlId(null);
                          })
                        }
                        disabled={pending}
                        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
                      >
                        Löschen
                      </button>
                    </>
                  )}
                  {auswahl.status === "ABGELEHNT" && (
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await nachtragWiedereroeffnen(lvId, auswahl.id);
                        })
                      }
                      disabled={pending}
                      className="rounded border border-blue-800 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                    >
                      Wieder öffnen
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-1 py-1.5">Pos.-Nr.</th>
                    <th className="px-1 py-1.5">Stichwort</th>
                    <th className="px-1 py-1.5 text-right">Menge</th>
                    <th className="px-1 py-1.5 text-center">ME</th>
                    <th className="px-1 py-1.5 text-right">EP Lohn</th>
                    <th className="px-1 py-1.5 text-right">EP Sonst.</th>
                    <th className="px-1 py-1.5 text-right">Betrag</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {auswahl.positionen.map((p) => (
                    <NtZeile
                      key={p.id}
                      lvId={lvId}
                      nachtragId={auswahl.id}
                      pos={p}
                      gesperrt={gesperrt}
                    />
                  ))}
                  {!gesperrt && (
                    <NeueNtZeile lvId={lvId} nachtragId={auswahl.id} />
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
              Nachtragssumme netto:{" "}
              <span className="ml-1 font-mono font-semibold text-slate-700">
                {euro.format(summe(auswahl.positionen))}
              </span>
            </div>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-slate-400">
            Wählen Sie links einen Nachtrag aus oder legen Sie einen neuen an.
          </p>
        )}
      </section>
    </div>
  );
}
