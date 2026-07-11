"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">
          Das hat leider nicht geklappt
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Die Aktion konnte nicht ausgeführt werden – möglicherweise wurde der
          Datensatz zwischenzeitlich geändert oder ist geschützt (z. B. bereits
          abgerechnet).
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900"
          >
            Erneut versuchen
          </button>
          <Link
            href="/"
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Zur Übersicht
          </Link>
        </div>
      </div>
    </div>
  );
}
