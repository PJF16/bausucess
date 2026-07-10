"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ansatzAendern,
  ansatzAnlegen,
  ansatzLoeschen,
  kalkParamsAendern,
  preiseUebernehmen,
  type AnsatzDaten,
} from "@/lib/actions/kalkulation";
import {
  ansatzKosten,
  mittellohnpreis,
  positionsEp,
  runde2,
  type KalkParams,
} from "@/lib/kalk";

export interface KalkGruppe {
  id: string;
  parentId: string | null;
  ebene: string;
  nummer: string;
  bezeichnung: string;
}

export interface KalkPosition {
  id: string;
  gruppeId: string;
  nummer: string;
  stichwort: string;
  einheit: string;
  menge: number;
  epLohn: number;
  epSonstiges: number;
}

export interface KalkAnsatzRow {
  id: string;
  positionId: string;
  art: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  preis: number;
}

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const ansatzArtLabel: Record<string, string> = {
  LOHN: "Lohn",
  MATERIAL: "Material",
  GERAET: "Gerät",
  FREMDLEISTUNG: "Fremdleistung",
  SONSTIGES: "Sonstiges",
};

// ── K3-Leiste: Kalkulationsparameter ────────────────────────────────

function ParamFeld({
  label,
  suffix,
  wert,
  onWert,
  onSpeichern,
  readonly,
}: {
  label: string;
  suffix: string;
  wert: number;
  onWert: (v: number) => void;
  onSpeichern: () => void;
  readonly: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <input
        type="number"
        step="0.01"
        value={wert}
        disabled={readonly}
        onChange={(e) => onWert(Number(e.target.value))}
        onBlur={onSpeichern}
        className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right font-mono text-xs focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
      />
      <span className="text-slate-400">{suffix}</span>
    </label>
  );
}

function K3Leiste({
  kalkulationId,
  params,
  readonly,
}: {
  kalkulationId: string;
  params: KalkParams;
  readonly: boolean;
}) {
  const [entwurf, setEntwurf] = useState(params);
  const [pending, startTransition] = useTransition();

  const speichern = () => {
    if (readonly) return;
    if (JSON.stringify(entwurf) === JSON.stringify(params)) return;
    startTransition(async () => {
      await kalkParamsAendern(kalkulationId, entwurf);
    });
  };

  const set = (k: keyof KalkParams) => (v: number) =>
    setEntwurf({ ...entwurf, [k]: v });

  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Kalkulationsansätze
      </span>
      <ParamFeld
        label="Mittellohnkosten"
        suffix="€/h"
        wert={entwurf.mittellohnkosten}
        onWert={set("mittellohnkosten")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <ParamFeld
        label="Zuschlag Lohn"
        suffix="%"
        wert={entwurf.zuschlagLohn}
        onWert={set("zuschlagLohn")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <ParamFeld
        label="Material"
        suffix="%"
        wert={entwurf.zuschlagMaterial}
        onWert={set("zuschlagMaterial")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <ParamFeld
        label="Gerät"
        suffix="%"
        wert={entwurf.zuschlagGeraet}
        onWert={set("zuschlagGeraet")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <ParamFeld
        label="Fremdleistung"
        suffix="%"
        wert={entwurf.zuschlagFremd}
        onWert={set("zuschlagFremd")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <ParamFeld
        label="Sonstiges"
        suffix="%"
        wert={entwurf.zuschlagSonstiges}
        onWert={set("zuschlagSonstiges")}
        onSpeichern={speichern}
        readonly={readonly}
      />
      <span className="ml-auto rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-900">
        Mittellohnpreis: {euro.format(mittellohnpreis(entwurf))}/h
      </span>
    </div>
  );
}

// ── Ansatzzeile ─────────────────────────────────────────────────────

function AnsatzZeile({
  kalkulationId,
  ansatz,
  params,
  readonly,
}: {
  kalkulationId: string;
  ansatz: KalkAnsatzRow;
  params: KalkParams;
  readonly: boolean;
}) {
  const [entwurf, setEntwurf] = useState(ansatz);
  const [pending, startTransition] = useTransition();
  const istLohn = entwurf.art === "LOHN";

  const dirty =
    entwurf.art !== ansatz.art ||
    entwurf.bezeichnung !== ansatz.bezeichnung ||
    entwurf.menge !== ansatz.menge ||
    entwurf.einheit !== ansatz.einheit ||
    entwurf.preis !== ansatz.preis;

  const speichern = () => {
    if (!dirty || readonly) return;
    startTransition(async () => {
      await ansatzAendern(kalkulationId, ansatz.id, {
        art: entwurf.art as AnsatzDaten["art"],
        bezeichnung: entwurf.bezeichnung,
        menge: entwurf.menge,
        einheit: entwurf.einheit,
        preis: entwurf.preis,
      });
    });
  };

  const kosten = ansatzKosten(entwurf, params);
  const inputCls =
    "w-full border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:outline focus:outline-1 focus:outline-blue-500 rounded";

  return (
    <tr className={`border-t border-slate-100 ${pending ? "opacity-50" : ""}`}>
      <td className="w-32">
        <select
          className={inputCls + " text-xs"}
          value={entwurf.art}
          disabled={readonly}
          onChange={(e) => {
            const art = e.target.value;
            setEntwurf({
              ...entwurf,
              art,
              einheit: art === "LOHN" ? "h" : entwurf.einheit,
              preis: art === "LOHN" ? 0 : entwurf.preis,
            });
          }}
          onBlur={speichern}
        >
          {Object.entries(ansatzArtLabel).map(([w, l]) => (
            <option key={w} value={w}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className={inputCls}
          value={entwurf.bezeichnung}
          disabled={readonly}
          onChange={(e) =>
            setEntwurf({ ...entwurf, bezeichnung: e.target.value })
          }
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        <input
          type="number"
          step="0.0001"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.menge}
          disabled={readonly}
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
          disabled={readonly}
          onChange={(e) => setEntwurf({ ...entwurf, einheit: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        {istLohn ? (
          <span
            className="block px-1 text-right font-mono text-xs text-slate-400"
            title="Mittellohnpreis aus den Kalkulationsansätzen"
          >
            {zahl.format(mittellohnpreis(params))}
          </span>
        ) : (
          <input
            type="number"
            step="0.01"
            className={inputCls + " text-right font-mono text-xs"}
            value={entwurf.preis}
            disabled={readonly}
            onChange={(e) =>
              setEntwurf({ ...entwurf, preis: Number(e.target.value) })
            }
            onBlur={speichern}
          />
        )}
      </td>
      <td className="w-28 px-1 text-right font-mono text-xs font-semibold">
        {zahl.format(runde2(kosten.lohn + kosten.sonstiges))}
      </td>
      <td className="w-8 text-center">
        {!readonly && (
          <button
            title="Ansatz löschen"
            className="text-slate-300 hover:text-red-600"
            onClick={() =>
              startTransition(async () => {
                await ansatzLoeschen(kalkulationId, ansatz.id);
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

// ── Neuer Ansatz ────────────────────────────────────────────────────

const leererAnsatz = {
  art: "LOHN",
  bezeichnung: "",
  menge: 0,
  einheit: "h",
  preis: 0,
};

function NeuerAnsatzZeile({
  kalkulationId,
  positionId,
}: {
  kalkulationId: string;
  positionId: string;
}) {
  const [entwurf, setEntwurf] = useState(leererAnsatz);
  const [pending, startTransition] = useTransition();
  const istLohn = entwurf.art === "LOHN";

  const anlegen = () => {
    if (!entwurf.bezeichnung.trim()) return;
    startTransition(async () => {
      await ansatzAnlegen(kalkulationId, positionId, {
        ...entwurf,
        art: entwurf.art as AnsatzDaten["art"],
      });
      setEntwurf(leererAnsatz);
    });
  };

  const inputCls =
    "w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <tr
      className={`border-t-2 border-slate-200 bg-slate-50 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <td className="w-32 p-1">
        <select
          className={inputCls + " text-xs"}
          value={entwurf.art}
          onChange={(e) =>
            setEntwurf({
              ...entwurf,
              art: e.target.value,
              einheit: e.target.value === "LOHN" ? "h" : "kg",
            })
          }
        >
          {Object.entries(ansatzArtLabel).map(([w, l]) => (
            <option key={w} value={w}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1">
        <input
          className={inputCls}
          placeholder="Neuer Ansatz (z. B. Maurer, Beton C25/30, Kran) …"
          value={entwurf.bezeichnung}
          onChange={(e) =>
            setEntwurf({ ...entwurf, bezeichnung: e.target.value })
          }
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
      </td>
      <td className="w-24 p-1">
        <input
          type="number"
          step="0.0001"
          className={inputCls + " text-right font-mono text-xs"}
          value={entwurf.menge}
          onChange={(e) =>
            setEntwurf({ ...entwurf, menge: Number(e.target.value) })
          }
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
        {istLohn ? (
          <span className="block px-1 text-right font-mono text-xs text-slate-400">
            MLP
          </span>
        ) : (
          <input
            type="number"
            step="0.01"
            className={inputCls + " text-right font-mono text-xs"}
            value={entwurf.preis}
            onChange={(e) =>
              setEntwurf({ ...entwurf, preis: Number(e.target.value) })
            }
          />
        )}
      </td>
      <td />
      <td className="w-8 p-1 text-center">
        <button
          title="Ansatz anlegen"
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

export function KalkEditor({
  kalkulationId,
  params,
  gruppen,
  positionen,
  ansaetze,
  darfBearbeiten,
}: {
  kalkulationId: string;
  params: KalkParams;
  gruppen: KalkGruppe[];
  positionen: KalkPosition[];
  ansaetze: KalkAnsatzRow[];
  darfBearbeiten: boolean;
}) {
  const [auswahlId, setAuswahlId] = useState<string | null>(
    positionen[0]?.id ?? null
  );
  const [pending, startTransition] = useTransition();

  const auswahl = positionen.find((p) => p.id === auswahlId) ?? null;
  const auswahlAnsaetze = ansaetze.filter((a) => a.positionId === auswahlId);

  // Baumdarstellung: Gruppen mit eingerückten Positionen
  const baum = useMemo(() => {
    const tiefen = new Map<string, number>();
    const tiefe = (g: KalkGruppe): number => {
      if (tiefen.has(g.id)) return tiefen.get(g.id)!;
      const parent = gruppen.find((x) => x.id === g.parentId);
      const t = parent ? tiefe(parent) + 1 : 0;
      tiefen.set(g.id, t);
      return t;
    };
    const zeilen: Array<
      | { typ: "gruppe"; gruppe: KalkGruppe; tiefe: number }
      | { typ: "position"; position: KalkPosition; tiefe: number }
    > = [];
    const rekursiv = (parentId: string | null) => {
      for (const g of gruppen.filter((x) => x.parentId === parentId)) {
        zeilen.push({ typ: "gruppe", gruppe: g, tiefe: tiefe(g) });
        for (const p of positionen.filter((x) => x.gruppeId === g.id)) {
          zeilen.push({ typ: "position", position: p, tiefe: tiefe(g) + 1 });
        }
        rekursiv(g.id);
      }
    };
    rekursiv(null);
    return zeilen;
  }, [gruppen, positionen]);

  const kalkuliert = auswahl
    ? positionsEp(auswahlAnsaetze, params)
    : { epLohn: 0, epSonstiges: 0 };
  const lvEp = auswahl ? auswahl.epLohn + auswahl.epSonstiges : 0;
  const kalkEp = kalkuliert.epLohn + kalkuliert.epSonstiges;
  const abweichung = auswahl && lvEp !== kalkEp;

  const positionenMitAnsaetzen = new Set(ansaetze.map((a) => a.positionId));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <K3Leiste
        kalkulationId={kalkulationId}
        params={params}
        readonly={!darfBearbeiten}
      />
      <div className="flex min-h-0 flex-1">
        {/* Linke Spalte: Positionen */}
        <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Positionen
            </span>
            {darfBearbeiten && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await preiseUebernehmen(kalkulationId);
                  })
                }
                disabled={pending || positionenMitAnsaetzen.size === 0}
                className="rounded bg-blue-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                title="Kalkulierte Preise aller Positionen mit Ansätzen ins LV übernehmen"
              >
                Alle Preise ins LV übernehmen
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {baum.map((zeile) =>
              zeile.typ === "gruppe" ? (
                <div
                  key={zeile.gruppe.id}
                  className="flex items-center gap-1 px-1 py-0.5 text-xs font-semibold text-slate-500"
                  style={{ paddingLeft: `${zeile.tiefe * 14 + 4}px` }}
                >
                  <span className="font-mono">{zeile.gruppe.nummer}</span>
                  <span className="truncate">{zeile.gruppe.bezeichnung}</span>
                </div>
              ) : (
                <div
                  key={zeile.position.id}
                  onClick={() => setAuswahlId(zeile.position.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-sm ${
                    auswahlId === zeile.position.id
                      ? "bg-blue-100 font-semibold text-blue-900"
                      : "hover:bg-slate-100"
                  }`}
                  style={{ paddingLeft: `${zeile.tiefe * 14 + 4}px` }}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      positionenMitAnsaetzen.has(zeile.position.id)
                        ? "bg-green-500"
                        : "bg-slate-200"
                    }`}
                    title={
                      positionenMitAnsaetzen.has(zeile.position.id)
                        ? "Kalkuliert"
                        : "Noch nicht kalkuliert"
                    }
                  />
                  <span className="font-mono text-xs text-slate-500">
                    {zeile.position.nummer}
                  </span>
                  <span className="flex-1 truncate">
                    {zeile.position.stichwort}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {euro.format(
                      zeile.position.epLohn + zeile.position.epSonstiges
                    )}
                  </span>
                </div>
              )
            )}
          </div>
        </aside>

        {/* Rechte Spalte: K7-Blatt der Position */}
        <section className="flex min-w-0 flex-1 flex-col">
          {auswahl ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
                <div className="text-sm font-semibold">
                  {auswahl.nummer} {auswahl.stichwort}
                  <span className="ml-2 font-normal text-slate-500">
                    ({zahl.format(auswahl.menge)} {auswahl.einheit})
                  </span>
                </div>
                {darfBearbeiten && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await preiseUebernehmen(kalkulationId, auswahl.id);
                      })
                    }
                    disabled={pending || auswahlAnsaetze.length === 0}
                    className="rounded bg-blue-800 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                  >
                    EP ins LV übernehmen
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-1 py-1.5">Kostenart</th>
                      <th className="px-1 py-1.5">Bezeichnung</th>
                      <th className="px-1 py-1.5 text-right">
                        Ansatz je {auswahl.einheit}
                      </th>
                      <th className="px-1 py-1.5 text-center">Einh.</th>
                      <th className="px-1 py-1.5 text-right">Preis €</th>
                      <th className="px-1 py-1.5 text-right">
                        Kosten je {auswahl.einheit} €
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {auswahlAnsaetze.map((a) => (
                      <AnsatzZeile
                        key={a.id}
                        kalkulationId={kalkulationId}
                        ansatz={a}
                        params={params}
                        readonly={!darfBearbeiten}
                      />
                    ))}
                    {darfBearbeiten && (
                      <NeuerAnsatzZeile
                        kalkulationId={kalkulationId}
                        positionId={auswahl.id}
                      />
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-white px-4 py-2 text-xs">
                <span className="text-slate-500">
                  Kalkuliert: Lohn{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {zahl.format(kalkuliert.epLohn)}
                  </span>{" "}
                  + Sonstiges{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {zahl.format(kalkuliert.epSonstiges)}
                  </span>{" "}
                  ={" "}
                  <span className="font-mono font-semibold text-blue-900">
                    {euro.format(kalkEp)}
                  </span>
                  /{auswahl.einheit}
                </span>
                <span
                  className={
                    abweichung ? "font-semibold text-amber-600" : "text-slate-500"
                  }
                >
                  EP im LV: {euro.format(lvEp)}
                  {abweichung && " ≠"}
                </span>
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-sm text-slate-400">
              Wählen Sie links eine Position aus, um sie zu kalkulieren.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
