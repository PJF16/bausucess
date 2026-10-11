"use client";

import { useActionState, useState } from "react";
import { lvImportieren } from "@/lib/actions/onlv";

export function OnlvImportForm({ projektId }: { projektId: string }) {
  const [dateiFehler, setDateiFehler] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    lvImportieren.bind(null, projektId),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        type="file"
        name="datei"
        accept=".onlv,.xml"
        required
        onChange={(event) => {
          const datei = event.currentTarget.files?.[0];
          setDateiFehler(
            datei && datei.size > 10 * 1024 * 1024
              ? "Die Datei ist zu groß (max. 10 MB)."
              : null
          );
        }}
        className="text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      <button
        type="submit"
        disabled={pending || Boolean(dateiFehler)}
        className="rounded border border-blue-800 px-4 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
      >
        {pending ? "Importieren …" : "Importieren"}
      </button>
      {(dateiFehler || state?.error) && (
        <p role="alert" className="text-sm text-red-600">{dateiFehler || state?.error}</p>
      )}
    </form>
  );
}
