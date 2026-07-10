"use client";

export function DruckButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 print:hidden"
      title="Drucken oder als PDF speichern (über den Druckdialog des Browsers)"
    >
      🖨 Drucken / PDF
    </button>
  );
}
