import Link from "next/link";

export type LvTab =
  | "positionen"
  | "kalkulation"
  | "vergabe"
  | "nachtraege"
  | "abrechnung";

const TABS: Array<{ key: LvTab; label: string; pfad: string }> = [
  { key: "positionen", label: "LV-Positionen", pfad: "" },
  { key: "kalkulation", label: "Kalkulation", pfad: "/kalkulation" },
  { key: "vergabe", label: "Vergabe", pfad: "/vergabe" },
  { key: "nachtraege", label: "Nachträge", pfad: "/nachtraege" },
  { key: "abrechnung", label: "Abrechnung", pfad: "/abrechnung" },
];

export function LvTabs({
  projektId,
  lvId,
  aktiv,
}: {
  projektId: string;
  lvId: string;
  aktiv: LvTab;
}) {
  const basis = `/projekte/${projektId}/lv/${lvId}`;
  return (
    <>
      {TABS.map((tab) =>
        tab.key === aktiv ? (
          <span
            key={tab.key}
            className="rounded bg-blue-800 px-3 py-1 font-semibold text-white"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={`${basis}${tab.pfad}`}
            className="rounded px-3 py-1 text-slate-600 hover:bg-slate-100"
          >
            {tab.label}
          </Link>
        )
      )}
    </>
  );
}
