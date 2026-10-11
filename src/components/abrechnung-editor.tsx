"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  blattAnlegen,
  blattLoeschen,
  rechnungErstellen,
  zeileAendern,
  zeileAnlegen,
  zeileLoeschen,
} from "@/lib/actions/abrechnung";
import { ansatzAuswerten } from "@/lib/aufmass";

export interface AbrGruppe {
  id: string;
  parentId: string | null;
  nummer: string;
  bezeichnung: string;
}

export interface AbrPosition {
  id: string;
  gruppeId: string;
  nummer: string;
  stichwort: string;
  einheit: string;
  mengeSoll: number;
  ep: number;
}

export interface AbrBlatt {
  id: string;
  nummer: number;
  bezeichnung: string;
}

export interface AbrZeile {
  id: string;
  blattId: string;
  positionId: string;
  bezeichnung: string;
  ansatz: string;
  menge: number;
  rechnungNummer: number | null;
}

export interface AbrRechnung {
  id: string;
  nummer: number;
  art: string;
  status: string;
  betrag: number;
  betragIstZahlbetrag: boolean;
}

const euro = new Intl.NumberFormat("de-AT", {
  style: "currency",
  currency: "EUR",
});
const zahl = new Intl.NumberFormat("de-AT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const rechnungStatusLabel: Record<string, string> = {
  ENTWURF: "Entwurf",
  GELEGT: "gelegt",
  BEZAHLT: "bezahlt",
  STORNIERT: "storniert",
};

// ── Kopfleiste: Blätter + Rechnungen ────────────────────────────────

function AbrechnungKopf({
  lvId,
  blaetter,
  rechnungen,
  offeneZeilen,
  hatZeilen,
  basisPfad,
  readonly,
}: {
  lvId: string;
  blaetter: AbrBlatt[];
  rechnungen: AbrRechnung[];
  offeneZeilen: number;
  hatZeilen: boolean;
  basisPfad: string;
  readonly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [neuBezeichnung, setNeuBezeichnung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const srVorhanden = rechnungen.some((r) => r.art === "SCHLUSSRECHNUNG" && r.status !== "STORNIERT");
  const entwurfVorhanden = rechnungen.some((r) => r.status === "ENTWURF");

  const anlegen = () => {
    if (!neuBezeichnung.trim()) return;
    startTransition(async () => {
      await blattAnlegen(lvId, neuBezeichnung);
      setNeuBezeichnung("");
    });
  };

  return (
    <div className={`border-b border-slate-200 bg-white px-4 py-2 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Aufmaßblätter
        </span>
        {blaetter.map((b) => (
          <span
            key={b.id}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
          >
            <span className="font-mono">{b.nummer}</span>
            <span>{b.bezeichnung}</span>
            {!readonly && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    setFehler(null);
                    try {
                      await blattLoeschen(lvId, b.id);
                    } catch {
                      setFehler(
                        `Blatt ${b.nummer} enthält abgerechnete Zeilen und kann nicht gelöscht werden.`
                      );
                    }
                  })
                }
                className="opacity-50 hover:opacity-100"
                title="Blatt löschen (nur ohne abgerechnete Zeilen)"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {!readonly && (
          <>
            <input
              value={neuBezeichnung}
              onChange={(e) => setNeuBezeichnung(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
              placeholder="Neues Blatt (z. B. Keller, KW 28) …"
              className="w-48 rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-600 focus:outline-none"
            />
            <button
              onClick={anlegen}
              disabled={!neuBezeichnung.trim()}
              className="rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
            >
              + Blatt
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {rechnungen.map((r) => (
            <Link
              key={r.id}
              href={`${basisPfad}/rechnungen/${r.id}`}
              className={`rounded-full px-2.5 py-1 text-xs hover:opacity-80 ${
                r.status === "STORNIERT"
                  ? "bg-red-100 text-red-800 line-through"
                  : r.status === "BEZAHLT"
                  ? "bg-green-100 text-green-800"
                  : r.status === "GELEGT"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-amber-100 text-amber-800"
              }`}
              title={`${r.art === "SCHLUSSRECHNUNG" ? "Schlussrechnung" : "Teilrechnung"} · ${rechnungStatusLabel[r.status]} · ${r.betragIstZahlbetrag ? "Zahlbetrag brutto" : "Leistungssumme netto (Entwurf)"}`}
            >
              {r.status === "STORNIERT" ? "Storniert · " : ""}{r.art === "SCHLUSSRECHNUNG" ? "SR" : "TR"} {r.nummer} ·{" "}
              {euro.format(r.betrag)}
            </Link>
          ))}
          {!readonly && (
            <>
              <button
                onClick={() =>
                  startTransition(async () => {
                    setFehler(null);
                    try {
                      await rechnungErstellen(lvId, "TEILRECHNUNG");
                    } catch {
                      setFehler(
                        "Teilrechnung kann nicht erstellt werden – nach der Schlussrechnung sind keine weiteren Rechnungen möglich."
                      );
                    }
                  })
                }
                disabled={offeneZeilen === 0 || srVorhanden}
                title={
                  srVorhanden
                    ? "Nach der Schlussrechnung sind keine weiteren Rechnungen möglich"
                    : offeneZeilen === 0
                      ? "Keine offenen Aufmaßzeilen"
                      : `${offeneZeilen} offene Aufmaßzeilen abrechnen`
                }
                className="rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
              >
                Teilrechnung erstellen
              </button>
              <button
                onClick={() =>
                  startTransition(async () => {
                    setFehler(null);
                    try {
                      await rechnungErstellen(lvId, "SCHLUSSRECHNUNG");
                    } catch {
                      setFehler(
                        "Schlussrechnung kann nicht erstellt werden – zuerst alle Entwurfsrechnungen legen oder löschen."
                      );
                    }
                  })
                }
                disabled={!hatZeilen || srVorhanden || entwurfVorhanden}
                title={
                  srVorhanden
                    ? "Es existiert bereits eine Schlussrechnung"
                    : entwurfVorhanden
                      ? "Zuerst alle Entwurfsrechnungen legen oder löschen"
                      : !hatZeilen
                        ? "Es sind noch keine Aufmaßzeilen erfasst"
                        : "Endabrechnung inkl. Rücklassauflösung"
                }
                className="rounded border border-blue-800 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-40"
              >
                Schlussrechnung
              </button>
            </>
          )}
        </div>
      </div>
      {fehler && <p className="mt-1 text-xs text-red-600">{fehler}</p>}
    </div>
  );
}

// ── Aufmaßzeile ─────────────────────────────────────────────────────

function ZeileRow({
  lvId,
  zeile,
  blaetter,
  readonly,
}: {
  lvId: string;
  zeile: AbrZeile;
  blaetter: AbrBlatt[];
  readonly: boolean;
}) {
  const [entwurf, setEntwurf] = useState(zeile);
  const [pending, startTransition] = useTransition();
  const [zeilenFehler, setZeilenFehler] = useState<string | null>(null);
  const gesperrt = zeile.rechnungNummer !== null || readonly;

  const berechnet = entwurf.ansatz.trim()
    ? ansatzAuswerten(entwurf.ansatz)
    : null;
  const ungueltig = entwurf.ansatz.trim() !== "" && berechnet === null;
  const menge = berechnet ?? entwurf.menge;

  const dirty =
    entwurf.bezeichnung !== zeile.bezeichnung ||
    entwurf.ansatz !== zeile.ansatz ||
    entwurf.menge !== zeile.menge;

  const speichern = () => {
    if (!dirty || gesperrt || ungueltig) return;
    startTransition(async () => {
      try {
        setZeilenFehler(null);
        await zeileAendern(lvId, zeile.id, {
          bezeichnung: entwurf.bezeichnung,
          ansatz: entwurf.ansatz,
          menge,
        });
      } catch (error) {
        setZeilenFehler(error instanceof Error ? error.message : "Aufmaßzeile konnte nicht gespeichert werden.");
      }
    });
  };

  const blatt = blaetter.find((b) => b.id === zeile.blattId);
  const inputCls = `w-full border-0 bg-transparent px-1 py-0.5 text-sm rounded ${
    gesperrt
      ? "text-slate-400"
      : "focus:bg-white focus:outline focus:outline-1 focus:outline-blue-500"
  }`;

  return (
    <tr className={`border-t border-slate-100 ${pending ? "opacity-50" : ""}`}>
      <td className="w-28 px-1 text-xs text-slate-500">
        {blatt ? `${blatt.nummer} ${blatt.bezeichnung}` : "–"}
        {zeilenFehler && <div role="alert" className="text-[10px] text-red-700">{zeilenFehler}</div>}
      </td>
      <td>
        <input
          className={inputCls}
          value={entwurf.bezeichnung}
          disabled={gesperrt}
          onChange={(e) =>
            setEntwurf({ ...entwurf, bezeichnung: e.target.value })
          }
          onBlur={speichern}
        />
      </td>
      <td className="w-56">
        <input
          className={`${inputCls} font-mono text-xs ${ungueltig ? "text-red-600" : ""}`}
          value={entwurf.ansatz}
          disabled={gesperrt}
          placeholder="z. B. 12,50*3,20"
          title={ungueltig ? "Ansatz kann nicht ausgewertet werden" : undefined}
          onChange={(e) => setEntwurf({ ...entwurf, ansatz: e.target.value })}
          onBlur={speichern}
        />
      </td>
      <td className="w-24">
        {entwurf.ansatz.trim() ? (
          <span
            className={`block px-1 text-right font-mono text-xs ${
              ungueltig ? "text-red-600" : "text-slate-500"
            }`}
            title="Aus dem Ansatz berechnet"
          >
            {ungueltig ? "?" : zahl.format(menge)}
          </span>
        ) : (
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
        )}
      </td>
      <td className="w-20 px-1 text-center">
        {zeile.rechnungNummer !== null ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            RE {zeile.rechnungNummer}
          </span>
        ) : (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            offen
          </span>
        )}
      </td>
      <td className="w-8 text-center">
        {!gesperrt && (
          <button
            title="Zeile löschen"
            className="text-slate-300 hover:text-red-600"
            onClick={() =>
              startTransition(async () => {
                await zeileLoeschen(lvId, zeile.id);
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

// ── Neue Zeile ──────────────────────────────────────────────────────

function NeueZeileRow({
  lvId,
  positionId,
  blaetter,
}: {
  lvId: string;
  positionId: string;
  blaetter: AbrBlatt[];
}) {
  const [blattId, setBlattId] = useState(blaetter[0]?.id ?? "");
  const [bezeichnung, setBezeichnung] = useState("");
  const [ansatz, setAnsatz] = useState("");
  const [menge, setMenge] = useState(0);
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  const berechnet = ansatz.trim() ? ansatzAuswerten(ansatz) : null;
  const ungueltig = ansatz.trim() !== "" && berechnet === null;

  const anlegen = () => {
    if (!blattId || ungueltig) return;
    if (!bezeichnung.trim() && !ansatz.trim() && menge === 0) return;
    startTransition(async () => {
      try {
        setFehler(null);
        await zeileAnlegen(lvId, blattId, positionId, {
          bezeichnung,
          ansatz,
          menge: berechnet ?? menge,
        });
        setBezeichnung("");
        setAnsatz("");
        setMenge(0);
      } catch (error) {
        setFehler(error instanceof Error ? error.message : "Aufmaßzeile konnte nicht angelegt werden.");
      }
    });
  };

  const inputCls =
    "w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <tr className={`border-t-2 border-slate-200 bg-slate-50 ${pending ? "opacity-50" : ""}`}>
      <td className="w-28 p-1">
        <select
          className={inputCls + " text-xs"}
          value={blattId}
          onChange={(e) => setBlattId(e.target.value)}
        >
          {blaetter.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nummer} {b.bezeichnung}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1">
        <input
          className={inputCls}
          placeholder="Neue Aufmaßzeile (z. B. Achse A–B) …"
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
      </td>
      <td className="w-56 p-1">
        <input
          className={`${inputCls} font-mono text-xs ${ungueltig ? "border-red-400 text-red-600" : ""}`}
          placeholder="12,50*3,20"
          value={ansatz}
          onChange={(e) => setAnsatz(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && anlegen()}
        />
      </td>
      <td className="w-24 p-1">
        {ansatz.trim() ? (
          <span
            className={`block px-1 text-right font-mono text-xs ${
              ungueltig ? "text-red-600" : "text-slate-500"
            }`}
          >
            {ungueltig ? "?" : zahl.format(berechnet ?? 0)}
          </span>
        ) : (
          <input
            type="number"
            step="0.001"
            className={inputCls + " text-right font-mono text-xs"}
            value={menge}
            onChange={(e) => setMenge(Number(e.target.value))}
          />
        )}
      </td>
      <td className="text-[10px] text-red-700" role={fehler ? "alert" : undefined}>{fehler ?? ""}</td>
      <td className="w-8 p-1 text-center">
        <button
          title="Zeile anlegen"
          onClick={anlegen}
          disabled={!blattId}
          className="rounded bg-blue-800 px-2 py-0.5 text-xs font-bold text-white hover:bg-blue-900 disabled:opacity-40"
        >
          +
        </button>
      </td>
    </tr>
  );
}

// ── Editor ──────────────────────────────────────────────────────────

export function AbrechnungEditor({
  lvId,
  basisPfad,
  gruppen,
  positionen,
  blaetter,
  zeilen,
  rechnungen,
  darfBearbeiten,
}: {
  lvId: string;
  basisPfad: string;
  gruppen: AbrGruppe[];
  positionen: AbrPosition[];
  blaetter: AbrBlatt[];
  zeilen: AbrZeile[];
  rechnungen: AbrRechnung[];
  darfBearbeiten: boolean;
}) {
  const [auswahlId, setAuswahlId] = useState<string | null>(
    positionen[0]?.id ?? null
  );

  const auswahl = positionen.find((p) => p.id === auswahlId) ?? null;
  const auswahlZeilen = zeilen.filter((z) => z.positionId === auswahlId);

  // Aufgemessene Menge je Position
  const mengeJePosition = useMemo(() => {
    const map = new Map<string, number>();
    for (const z of zeilen) {
      map.set(z.positionId, (map.get(z.positionId) ?? 0) + z.menge);
    }
    return map;
  }, [zeilen]);

  const offeneZeilen = zeilen.filter((z) => z.rechnungNummer === null).length;

  // Baum: Gruppen mit eingerückten Positionen (wie im Kalkulations-Editor)
  const baum = useMemo(() => {
    const tiefen = new Map<string, number>();
    const tiefe = (g: AbrGruppe): number => {
      if (tiefen.has(g.id)) return tiefen.get(g.id)!;
      const parent = gruppen.find((x) => x.id === g.parentId);
      const t = parent ? tiefe(parent) + 1 : 0;
      tiefen.set(g.id, t);
      return t;
    };
    const liste: Array<
      | { typ: "gruppe"; gruppe: AbrGruppe; tiefe: number }
      | { typ: "position"; position: AbrPosition; tiefe: number }
    > = [];
    const rekursiv = (parentId: string | null) => {
      for (const g of gruppen.filter((x) => x.parentId === parentId)) {
        liste.push({ typ: "gruppe", gruppe: g, tiefe: tiefe(g) });
        for (const p of positionen.filter((x) => x.gruppeId === g.id)) {
          liste.push({ typ: "position", position: p, tiefe: tiefe(g) + 1 });
        }
        rekursiv(g.id);
      }
    };
    rekursiv(null);
    return liste;
  }, [gruppen, positionen]);

  const auswahlMenge = auswahl ? (mengeJePosition.get(auswahl.id) ?? 0) : 0;
  const auswahlOffen = auswahlZeilen
    .filter((z) => z.rechnungNummer === null)
    .reduce((acc, z) => acc + z.menge, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AbrechnungKopf
        lvId={lvId}
        blaetter={blaetter}
        rechnungen={rechnungen}
        offeneZeilen={offeneZeilen}
        hatZeilen={zeilen.length > 0}
        basisPfad={basisPfad}
        readonly={!darfBearbeiten}
      />
      <div className="flex min-h-0 flex-1">
        {/* Linke Spalte: Positionen mit Abrechnungsstand */}
        <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Positionen · aufgemessen / LV-Menge
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
                  <span className="font-mono text-xs text-slate-500">
                    {zeile.position.nummer}
                  </span>
                  <span className="flex-1 truncate">
                    {zeile.position.stichwort}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {zahl.format(mengeJePosition.get(zeile.position.id) ?? 0)}
                    {" / "}
                    {zahl.format(zeile.position.mengeSoll)}{" "}
                    {zeile.position.einheit}
                  </span>
                </div>
              )
            )}
          </div>
        </aside>

        {/* Rechte Spalte: Aufmaßzeilen der Position */}
        <section className="flex min-w-0 flex-1 flex-col">
          {auswahl ? (
            <>
              <div className="border-b border-slate-200 bg-white px-4 py-2 text-sm font-semibold">
                {auswahl.nummer} {auswahl.stichwort}
                <span className="ml-2 font-normal text-slate-500">
                  LV-Menge {zahl.format(auswahl.mengeSoll)} {auswahl.einheit} ·
                  EP {euro.format(auswahl.ep)}
                </span>
              </div>
              {blaetter.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">
                  Legen Sie oben zuerst ein Aufmaßblatt an, um Mengen zu
                  erfassen.
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-1 py-1.5">Blatt</th>
                        <th className="px-1 py-1.5">Bezeichnung</th>
                        <th className="px-1 py-1.5">Ansatz</th>
                        <th className="px-1 py-1.5 text-right">
                          Menge ({auswahl.einheit})
                        </th>
                        <th className="px-1 py-1.5 text-center">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {auswahlZeilen.map((z) => (
                        <ZeileRow
                          key={z.id}
                          lvId={lvId}
                          zeile={z}
                          blaetter={blaetter}
                          readonly={!darfBearbeiten}
                        />
                      ))}
                      {darfBearbeiten && (
                        <NeueZeileRow
                          lvId={lvId}
                          positionId={auswahl.id}
                          blaetter={blaetter}
                        />
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
                <span>
                  Aufgemessen:{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {zahl.format(auswahlMenge)} {auswahl.einheit}
                  </span>{" "}
                  ({Math.round(
                    auswahl.mengeSoll > 0
                      ? (auswahlMenge / auswahl.mengeSoll) * 100
                      : 0
                  )}
                  % der LV-Menge)
                </span>
                <span>
                  Davon offen:{" "}
                  <span className="font-mono font-semibold text-amber-700">
                    {zahl.format(auswahlOffen)} {auswahl.einheit}
                  </span>{" "}
                  = {euro.format(auswahlOffen * auswahl.ep)}
                </span>
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-sm text-slate-400">
              Wählen Sie links eine Position aus, um Aufmaße zu erfassen.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
