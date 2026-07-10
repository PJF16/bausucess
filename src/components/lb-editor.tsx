"use client";

import { useMemo, useState, useTransition } from "react";
import {
  lbGruppeAnlegen,
  lbGruppeLoeschen,
  lbPositionAendern,
  lbPositionAnlegen,
  lbPositionLoeschen,
} from "@/lib/actions/leistungsbuch";

export interface LbGruppeRow {
  id: string;
  parentId: string | null;
  nummer: string;
  bezeichnung: string;
}

export interface LbPositionRow {
  id: string;
  gruppeId: string;
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
}

// ── Positionszeile ──────────────────────────────────────────────────

function LbZeile({
  pos,
  readonly,
}: {
  pos: LbPositionRow;
  readonly: boolean;
}) {
  const [entwurf, setEntwurf] = useState(pos);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(entwurf) !== JSON.stringify(pos);
  const speichern = () => {
    if (!dirty || readonly) return;
    startTransition(async () => {
      await lbPositionAendern(pos.id, {
        nummer: entwurf.nummer,
        stichwort: entwurf.stichwort,
        langtext: entwurf.langtext,
        einheit: entwurf.einheit,
      });
    });
  };

  const inputCls = `w-full border-0 bg-transparent px-1 py-0.5 text-sm rounded ${
    readonly
      ? "text-slate-400"
      : "focus:bg-white focus:outline focus:outline-1 focus:outline-blue-500"
  }`;

  return (
    <tr className={`border-t border-slate-100 align-top ${pending ? "opacity-50" : ""}`}>
      <td className="w-20">
        <input
          className={inputCls + " font-mono text-xs"}
          value={entwurf.nummer}
          disabled={readonly}
          onChange={(e) => setEntwurf({ ...entwurf, nummer: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td className="w-64">
        <input
          className={inputCls}
          value={entwurf.stichwort}
          disabled={readonly}
          onChange={(e) => setEntwurf({ ...entwurf, stichwort: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td>
        <textarea
          className={inputCls + " resize-y text-xs leading-snug"}
          rows={2}
          value={entwurf.langtext}
          disabled={readonly}
          onChange={(e) => setEntwurf({ ...entwurf, langtext: e.target.value })}
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
      <td className="w-8 text-center">
        {!readonly && (
          <button
            title="Stammposition löschen"
            className="text-slate-300 hover:text-red-600"
            onClick={() =>
              startTransition(async () => {
                await lbPositionLoeschen(pos.id);
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

// ── Editor ──────────────────────────────────────────────────────────

export function LbEditor({
  gruppen,
  positionen,
  darfBearbeiten,
}: {
  gruppen: LbGruppeRow[];
  positionen: LbPositionRow[];
  darfBearbeiten: boolean;
}) {
  const [auswahlId, setAuswahlId] = useState<string | null>(
    gruppen[0]?.id ?? null
  );
  const [neueGruppe, setNeueGruppe] = useState({ nummer: "", bezeichnung: "" });
  const [neuePos, setNeuePos] = useState({
    nummer: "",
    stichwort: "",
    langtext: "",
    einheit: "m²",
  });
  const [pending, startTransition] = useTransition();

  const baum = useMemo(() => {
    const tiefen = new Map<string, number>();
    const tiefe = (g: LbGruppeRow): number => {
      if (tiefen.has(g.id)) return tiefen.get(g.id)!;
      const parent = gruppen.find((x) => x.id === g.parentId);
      const t = parent ? tiefe(parent) + 1 : 0;
      tiefen.set(g.id, t);
      return t;
    };
    const liste: Array<{ gruppe: LbGruppeRow; tiefe: number }> = [];
    const rekursiv = (parentId: string | null) => {
      for (const g of gruppen.filter((x) => x.parentId === parentId)) {
        liste.push({ gruppe: g, tiefe: tiefe(g) });
        rekursiv(g.id);
      }
    };
    rekursiv(null);
    return liste;
  }, [gruppen]);

  const auswahl = gruppen.find((g) => g.id === auswahlId) ?? null;
  const auswahlPositionen = positionen.filter((p) => p.gruppeId === auswahlId);

  const gruppeHinzufuegen = (parentId: string | null) => {
    if (!neueGruppe.nummer.trim() || !neueGruppe.bezeichnung.trim()) return;
    startTransition(async () => {
      await lbGruppeAnlegen(parentId, neueGruppe.nummer, neueGruppe.bezeichnung);
      setNeueGruppe({ nummer: "", bezeichnung: "" });
    });
  };

  const positionHinzufuegen = () => {
    if (!auswahlId || !neuePos.nummer.trim() || !neuePos.stichwort.trim()) return;
    startTransition(async () => {
      await lbPositionAnlegen(auswahlId, neuePos);
      setNeuePos({ nummer: "", stichwort: "", langtext: "", einheit: "m²" });
    });
  };

  const inputCls =
    "rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-600 focus:outline-none";

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Gliederung
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {baum.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-400">
              Noch keine Gruppen – legen Sie unten die erste an.
            </p>
          )}
          {baum.map(({ gruppe, tiefe }) => (
            <div
              key={gruppe.id}
              onClick={() => setAuswahlId(gruppe.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-sm ${
                auswahlId === gruppe.id
                  ? "bg-blue-100 font-semibold text-blue-900"
                  : "hover:bg-slate-100"
              }`}
              style={{ paddingLeft: `${tiefe * 14 + 4}px` }}
            >
              <span className="font-mono text-xs text-slate-500">
                {gruppe.nummer}
              </span>
              <span className="flex-1 truncate">{gruppe.bezeichnung}</span>
              <span className="font-mono text-[11px] text-slate-400">
                {positionen.filter((p) => p.gruppeId === gruppe.id).length}
              </span>
            </div>
          ))}
        </div>
        {darfBearbeiten && (
          <div className={`border-t border-slate-200 p-3 ${pending ? "opacity-50" : ""}`}>
            <div className="mb-2 flex gap-2">
              <input
                placeholder="Nr."
                value={neueGruppe.nummer}
                onChange={(e) =>
                  setNeueGruppe({ ...neueGruppe, nummer: e.target.value })
                }
                className={inputCls + " w-16 font-mono text-xs"}
              />
              <input
                placeholder="Bezeichnung"
                value={neueGruppe.bezeichnung}
                onChange={(e) =>
                  setNeueGruppe({ ...neueGruppe, bezeichnung: e.target.value })
                }
                className={inputCls + " flex-1"}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => gruppeHinzufuegen(null)}
                className="flex-1 rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-900"
              >
                + Gruppe oberste Ebene
              </button>
              <button
                onClick={() => gruppeHinzufuegen(auswahlId)}
                disabled={!auswahl}
                className="flex-1 rounded border border-blue-800 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-40"
              >
                + Untergruppe
              </button>
            </div>
            {auswahl && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await lbGruppeLoeschen(auswahl.id);
                    setAuswahlId(null);
                  })
                }
                className="mt-2 w-full rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Ausgewählte Gruppe löschen
              </button>
            )}
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {auswahl ? (
          <>
            <div className="border-b border-slate-200 bg-white px-4 py-2 text-sm font-semibold">
              {auswahl.nummer} {auswahl.bezeichnung}
              <span className="ml-2 font-normal text-slate-500">
                {auswahlPositionen.length} Stammposition(en)
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-1 py-1.5">Pos.-Nr.</th>
                    <th className="px-1 py-1.5">Stichwort</th>
                    <th className="px-1 py-1.5">Langtext</th>
                    <th className="px-1 py-1.5 text-center">ME</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {auswahlPositionen.map((p) => (
                    <LbZeile key={p.id} pos={p} readonly={!darfBearbeiten} />
                  ))}
                  {darfBearbeiten && (
                    <tr className={`border-t-2 border-slate-200 bg-slate-50 ${pending ? "opacity-50" : ""}`}>
                      <td className="w-20 p-1">
                        <input
                          className={inputCls + " w-full font-mono text-xs"}
                          placeholder="Nr."
                          value={neuePos.nummer}
                          onChange={(e) =>
                            setNeuePos({ ...neuePos, nummer: e.target.value })
                          }
                        />
                      </td>
                      <td className="w-64 p-1">
                        <input
                          className={inputCls + " w-full"}
                          placeholder="Neue Stammposition …"
                          value={neuePos.stichwort}
                          onChange={(e) =>
                            setNeuePos({ ...neuePos, stichwort: e.target.value })
                          }
                          onKeyDown={(e) => e.key === "Enter" && positionHinzufuegen()}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className={inputCls + " w-full text-xs"}
                          placeholder="Langtext (optional)"
                          value={neuePos.langtext}
                          onChange={(e) =>
                            setNeuePos({ ...neuePos, langtext: e.target.value })
                          }
                        />
                      </td>
                      <td className="w-16 p-1">
                        <input
                          className={inputCls + " w-full text-center text-xs"}
                          value={neuePos.einheit}
                          onChange={(e) =>
                            setNeuePos({ ...neuePos, einheit: e.target.value })
                          }
                        />
                      </td>
                      <td className="w-8 p-1 text-center">
                        <button
                          onClick={positionHinzufuegen}
                          className="rounded bg-blue-800 px-2 py-0.5 text-xs font-bold text-white hover:bg-blue-900"
                        >
                          +
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-slate-400">
            Wählen Sie links eine Gruppe aus.
          </p>
        )}
      </section>
    </div>
  );
}
