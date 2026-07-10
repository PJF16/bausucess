"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registrieren } from "@/lib/actions/auth";

export default function RegistrierenPage() {
  const [state, formAction, pending] = useActionState(registrieren, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-blue-900">BauSuccess Web</div>
          <div className="mt-1 text-sm text-slate-500">Firma registrieren</div>
        </div>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Firmenname</label>
            <input
              name="firma"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ihr Name</label>
            <input
              name="name"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">E-Mail</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Passwort (min. 8 Zeichen)
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-blue-800 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
          >
            {pending ? "Registrieren …" : "Registrieren"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Bereits registriert?{" "}
          <Link href="/login" className="text-blue-700 hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
