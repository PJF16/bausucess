"use client";

import { useMemo, useState, useTransition } from "react";
import {
  gruppeAnlegen,
  gruppeLoeschen,
  gruppeVerschieben,
  positionAnlegen,
  positionAendern,
  positionLoeschen,
  positionVerschieben,
  type PositionsDaten,
} from "@/lib/actions/lv";
import { LbUebernahme } from "@/components/lb-uebernahme";

export interface GruppeNode {
  id: string;
  parentId: string | null;
  ebene: string;
  nummer: string;
  bezeichnung: string;
  kinder: GruppeNode[];
}

export interface PositionRow {
  id: string;
  gruppeId: string;
  nummer: string;
  stichwort: string;
  langtext: string;
  einheit: string;
  menge: number;
  art: string;
  epLohn: number;
  epSonstiges: number;
}

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

const posArtLabel: Record<string, string> = {
  NORMAL: "Normal",
  WESENTLICH: "Wesentlich",
  EVENTUAL: "Eventual",
  ALTERNATIV: "Alternativ",
  REGIE: "Regie",
};

const ebeneLabel: Record<string, string> = {
  HG: "HG",
  OG: "OG",
  LG: "LG",
  ULG: "ULG",
};

function positionsSumme(p: PositionRow) {
  // Eventual- und Alternativpositionen zählen nicht zur LV-Summe
  if (p.art === "EVENTUAL" || p.art === "ALTERNATIV") return 0;
  return p.menge * (p.epLohn + p.epSonstiges);
}

function sammleGruppenIds(g: GruppeNode, ziel: Set<string>) {
  ziel.add(g.id);
  for (const kind of g.kinder) sammleGruppenIds(kind, ziel);
}

// ── Baum ────────────────────────────────────────────────────────────

function BaumKnoten({
  gruppe,
  tiefe,
  auswahlId,
  onAuswahl,
  summen,
}: {
  gruppe: GruppeNode;
  tiefe: number;
  auswahlId: string | null;
  onAuswahl: (id: string) => void;
  summen: Map<string, number>;
}) {
  const [offen, setOffen] = useState(true);
  const aktiv = auswahlId === gruppe.id;
  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm ${
          aktiv ? "bg-blue-100 font-semibold text-blue-900" : "hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${tiefe * 14 + 4}px` }}
        onClick={() => onAuswahl(gruppe.id)}
      >
        {gruppe.kinder.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOffen(!offen);
            }}
            className="w-4 text-slate-400"
          >
            {offen ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="rounded bg-slate-200 px-1 font-mono text-[10px] text-slate-600">
          {ebeneLabel[gruppe.ebene]}
        </span>
        <span className="font-mono text-xs text-slate-500">{gruppe.nummer}</span>
        <span className="flex-1 truncate">{gruppe.bezeichnung}</span>
        <span className="font-mono text-[11px] text-slate-400">
          {euro.format(summen.get(gruppe.id) ?? 0)}
        </span>
      </div>
      {offen &&
        gruppe.kinder.map((k) => (
          <BaumKnoten
            key={k.id}
            gruppe={k}
            tiefe={tiefe + 1}
            auswahlId={auswahlId}
            onAuswahl={onAuswahl}
            summen={summen}
          />
        ))}
    </div>
  );
}

// ── Positionszeile mit Inline-Bearbeitung ───────────────────────────

function PositionZeile({
  lvId,
  pos,
  readonly,
}: {
  lvId: string;
  pos: PositionRow;
  readonly: boolean;
}) {
  const [entwurf, setEntwurf] = useState(pos);
  const [pending, startTransition] = useTransition();
  const [langtextOffen, setLangtextOffen] = useState(false);

  const dirty =
    entwurf.nummer !== pos.nummer ||
    entwurf.stichwort !== pos.stichwort ||
    entwurf.einheit !== pos.einheit ||
    entwurf.menge !== pos.menge ||
    entwurf.art !== pos.art ||
    entwurf.epLohn !== pos.epLohn ||
    entwurf.epSonstiges !== pos.epSonstiges ||
    entwurf.langtext !== pos.langtext;

  const speichern = () => {
    if (!dirty || readonly) return;
    startTransition(async () => {
      await positionAendern(lvId, pos.id, {
        nummer: entwurf.nummer,
        stichwort: entwurf.stichwort,
        langtext: entwurf.langtext,
        einheit: entwurf.einheit,
        menge: entwurf.menge,
        art: entwurf.art as PositionsDaten["art"],
        epLohn: entwurf.epLohn,
        epSonstiges: entwurf.epSonstiges,
      });
    });
  };

  const inputCls =
    "w-full border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:outline focus:outline-1 focus:outline-blue-500 rounded";
  const zahlCls = inputCls + " text-right font-mono text-xs";

  const ep = entwurf.epLohn + entwurf.epSonstiges;
  const gb = positionsSumme(entwurf);

  return (
    <>
      <tr className={`border-t border-slate-100 ${pending ? "opacity-50" : ""}`}>
        <td className="w-20">
          <input
            className={inputCls + " font-mono text-xs"}
            value={entwurf.nummer}
            disabled={readonly}
            onChange={(e) => setEntwurf({ ...entwurf, nummer: e.target.value })}
            onBlur={speichern}
          />
        </td>
        <td>
          <input
            className={inputCls}
            value={entwurf.stichwort}
            disabled={readonly}
            onChange={(e) => setEntwurf({ ...entwurf, stichwort: e.target.value })}
            onBlur={speichern}
          />
        </td>
        <td className="w-24">
          <select
            className={inputCls + " text-xs"}
            value={entwurf.art}
            disabled={readonly}
            onChange={(e) => setEntwurf({ ...entwurf, art: e.target.value })}
            onBlur={speichern}
          >
            {Object.entries(posArtLabel).map(([w, l]) => (
              <option key={w} value={w}>
                {l}
              </option>
            ))}
          </select>
        </td>
        <td className="w-24">
          <input
            type="number"
            step="0.001"
            className={zahlCls}
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
          <input
            type="number"
            step="0.01"
            className={zahlCls}
            value={entwurf.epLohn}
            disabled={readonly}
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
            className={zahlCls}
            value={entwurf.epSonstiges}
            disabled={readonly}
            onChange={(e) =>
              setEntwurf({ ...entwurf, epSonstiges: Number(e.target.value) })
            }
            onBlur={speichern}
          />
        </td>
        <td className="w-24 px-1 text-right font-mono text-xs">{zahl.format(ep)}</td>
        <td className="w-28 px-1 text-right font-mono text-xs font-semibold">
          {zahl.format(gb)}
        </td>
        <td className="w-20 text-center whitespace-nowrap">
          {!readonly && (
            <>
              <button
                title="Position nach oben"
                className="text-slate-300 hover:text-blue-700"
                onClick={() =>
                  startTransition(async () => {
                    await positionVerschieben(lvId, pos.id, "HOCH");
                  })
                }
              >
                ▲
              </button>
              <button
                title="Position nach unten"
                className="mr-1 text-slate-300 hover:text-blue-700"
                onClick={() =>
                  startTransition(async () => {
                    await positionVerschieben(lvId, pos.id, "RUNTER");
                  })
                }
              >
                ▼
              </button>
            </>
          )}
          <button
            title={langtextOffen ? "Langtext einklappen" : "Langtext anzeigen"}
            className={`mr-1 ${
              entwurf.langtext || langtextOffen
                ? "text-blue-700"
                : "text-slate-300 hover:text-blue-700"
            }`}
            onClick={() => setLangtextOffen(!langtextOffen)}
          >
            ≡
          </button>
          {!readonly && (
            <button
              title="Position löschen"
              className="text-slate-300 hover:text-red-600"
              onClick={() =>
                startTransition(async () => {
                  await positionLoeschen(lvId, pos.id);
                })
              }
            >
              ✕
            </button>
          )}
        </td>
      </tr>
      {langtextOffen && (
        <tr className={pending ? "opacity-50" : ""}>
          <td />
          <td colSpan={9} className="pb-2 pr-2">
            <textarea
              value={entwurf.langtext}
              disabled={readonly}
              placeholder="Langtext der Position (vollständige Leistungsbeschreibung) …"
              rows={Math.min(8, Math.max(3, entwurf.langtext.split("\n").length + 1))}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed focus:border-blue-500 focus:bg-white focus:outline-none"
              onChange={(e) =>
                setEntwurf({ ...entwurf, langtext: e.target.value })
              }
              onBlur={speichern}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Neue Position ───────────────────────────────────────────────────

const leerePosition: Omit<PositionsDaten, "art"> & { art: string } = {
  nummer: "",
  stichwort: "",
  langtext: "",
  einheit: "m²",
  menge: 0,
  art: "NORMAL",
  epLohn: 0,
  epSonstiges: 0,
};

function NeuePositionZeile({
  lvId,
  gruppeId,
}: {
  lvId: string;
  gruppeId: string;
}) {
  const [entwurf, setEntwurf] = useState(leerePosition);
  const [pending, startTransition] = useTransition();

  const anlegen = () => {
    if (!entwurf.nummer.trim() || !entwurf.stichwort.trim()) return;
    startTransition(async () => {
      await positionAnlegen(lvId, gruppeId, {
        ...entwurf,
        art: entwurf.art as PositionsDaten["art"],
      });
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
          placeholder="Stichwort der neuen Position …"
          value={entwurf.stichwort}
          onChange={(e) => setEntwurf({ ...entwurf, stichwort: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
      </td>
      <td className="w-24 p-1">
        <select
          className={inputCls + " text-xs"}
          value={entwurf.art}
          onChange={(e) => setEntwurf({ ...entwurf, art: e.target.value })}
        >
          {Object.entries(posArtLabel).map(([w, l]) => (
            <option key={w} value={w}>
              {l}
            </option>
          ))}
        </select>
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
      <td colSpan={2} />
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

export function LvEditor({
  lvId,
  ustSatz,
  gruppen,
  positionen,
  darfBearbeiten,
}: {
  lvId: string;
  ustSatz: number;
  gruppen: GruppeNode[];
  positionen: PositionRow[];
  darfBearbeiten: boolean;
}) {
  const [auswahlId, setAuswahlId] = useState<string | null>(
    gruppen[0]?.id ?? null
  );
  const [pending, startTransition] = useTransition();
  const [neueGruppe, setNeueGruppe] = useState({ nummer: "", bezeichnung: "" });

  // Gruppensummen (inkl. Untergruppen)
  const summen = useMemo(() => {
    const map = new Map<string, number>();
    const rechne = (g: GruppeNode): number => {
      let summe = positionen
        .filter((p) => p.gruppeId === g.id)
        .reduce((acc, p) => acc + positionsSumme(p), 0);
      for (const kind of g.kinder) summe += rechne(kind);
      map.set(g.id, summe);
      return summe;
    };
    for (const g of gruppen) rechne(g);
    return map;
  }, [gruppen, positionen]);

  const lvNetto = gruppen.reduce((acc, g) => acc + (summen.get(g.id) ?? 0), 0);
  const ust = (lvNetto * ustSatz) / 100;

  const auswahl = useMemo(() => {
    const suche = (liste: GruppeNode[]): GruppeNode | null => {
      for (const g of liste) {
        if (g.id === auswahlId) return g;
        const gefunden = suche(g.kinder);
        if (gefunden) return gefunden;
      }
      return null;
    };
    return suche(gruppen);
  }, [gruppen, auswahlId]);

  const auswahlPositionen = positionen.filter(
    (p) => p.gruppeId === auswahlId
  );

  const kannUntergruppe =
    auswahl != null && auswahl.ebene !== "ULG";

  const gruppeHinzufuegen = (parentId: string | null) => {
    if (!neueGruppe.nummer.trim() || !neueGruppe.bezeichnung.trim()) return;
    startTransition(async () => {
      await gruppeAnlegen(lvId, parentId, neueGruppe.nummer, neueGruppe.bezeichnung);
      setNeueGruppe({ nummer: "", bezeichnung: "" });
    });
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Linke Spalte: LV-Struktur */}
      <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          LV-Struktur
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {gruppen.length === 0 && (
            <p className="px-2 py-4 text-sm text-slate-400">
              Noch keine Gruppen – legen Sie unten die erste Leistungsgruppe an.
            </p>
          )}
          {gruppen.map((g) => (
            <BaumKnoten
              key={g.id}
              gruppe={g}
              tiefe={0}
              auswahlId={auswahlId}
              onAuswahl={setAuswahlId}
              summen={summen}
            />
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
              className="w-16 rounded border border-slate-300 px-2 py-1 font-mono text-xs focus:border-blue-600 focus:outline-none"
            />
            <input
              placeholder="Bezeichnung"
              value={neueGruppe.bezeichnung}
              onChange={(e) =>
                setNeueGruppe({ ...neueGruppe, bezeichnung: e.target.value })
              }
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => gruppeHinzufuegen(null)}
              className="flex-1 rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-900"
            >
              + LG auf oberster Ebene
            </button>
            <button
              onClick={() => gruppeHinzufuegen(auswahlId)}
              disabled={!kannUntergruppe}
              className="flex-1 rounded border border-blue-800 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Untergruppe
            </button>
          </div>
          {auswahl && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() =>
                  startTransition(async () => {
                    await gruppeVerschieben(lvId, auswahl.id, "HOCH");
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                title="Ausgewählte Gruppe nach oben"
              >
                ▲
              </button>
              <button
                onClick={() =>
                  startTransition(async () => {
                    await gruppeVerschieben(lvId, auswahl.id, "RUNTER");
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                title="Ausgewählte Gruppe nach unten"
              >
                ▼
              </button>
              <button
                onClick={() =>
                  startTransition(async () => {
                    const betroffen = new Set<string>();
                    sammleGruppenIds(auswahl, betroffen);
                    await gruppeLoeschen(lvId, auswahl.id);
                    if (auswahlId && betroffen.has(auswahlId)) setAuswahlId(null);
                  })
                }
                className="flex-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Ausgewählte Gruppe löschen
              </button>
            </div>
          )}
        </div>
        )}
      </aside>

      {/* Rechte Spalte: Positionen */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <div className="text-sm font-semibold">
            {auswahl
              ? `${auswahl.nummer} ${auswahl.bezeichnung}`
              : "Keine Gruppe ausgewählt"}
          </div>
          <div className="flex items-center gap-3">
            {darfBearbeiten && auswahl && (
              <LbUebernahme lvId={lvId} gruppeId={auswahl.id} />
            )}
            <div className="text-xs text-slate-500">
              Netto {euro.format(lvNetto)} · USt {ustSatz} % {euro.format(ust)} ·{" "}
              <span className="font-semibold text-slate-700">
                Brutto {euro.format(lvNetto + ust)}
              </span>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {auswahl ? (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-1 py-1.5">Pos.-Nr.</th>
                  <th className="px-1 py-1.5">Stichwort</th>
                  <th className="px-1 py-1.5">Art</th>
                  <th className="px-1 py-1.5 text-right">Menge</th>
                  <th className="px-1 py-1.5 text-center">ME</th>
                  <th className="px-1 py-1.5 text-right">EP Lohn</th>
                  <th className="px-1 py-1.5 text-right">EP Sonst.</th>
                  <th className="px-1 py-1.5 text-right">EP</th>
                  <th className="px-1 py-1.5 text-right">Positionsbetrag</th>
                  <th />
                </tr>
              </thead>
              <tbody className="bg-white">
                {auswahlPositionen.map((p) => (
                  <PositionZeile
                    key={p.id}
                    lvId={lvId}
                    pos={p}
                    readonly={!darfBearbeiten}
                  />
                ))}
                {darfBearbeiten && (
                  <NeuePositionZeile lvId={lvId} gruppeId={auswahl.id} />
                )}
              </tbody>
            </table>
          ) : (
            <p className="p-8 text-center text-sm text-slate-400">
              Wählen Sie links eine Gruppe aus, um Positionen zu bearbeiten.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
