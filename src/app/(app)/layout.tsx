import Link from "next/link";
import { requireUser } from "@/lib/session";
import { abmelden } from "@/lib/actions/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-blue-900 px-4 py-2 text-white shadow print:hidden">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            BauSuccess <span className="font-light">Web</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="opacity-90 hover:opacity-100">
              Projekte
            </Link>
            <Link href="/bieter" className="opacity-90 hover:opacity-100">
              Bieter
            </Link>
            <Link href="/leistungsbuch" className="opacity-90 hover:opacity-100">
              Leistungsbuch
            </Link>
            <Link href="/kalkulation" className="opacity-90 hover:opacity-100">
              Kalkulation
            </Link>
            <Link href="/vergabe" className="opacity-90 hover:opacity-100">
              Vergabe
            </Link>
            <Link href="/abrechnung" className="opacity-90 hover:opacity-100">
              Abrechnung
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <form action="/suche">
            <input
              name="q"
              type="search"
              placeholder="Suchen …"
              className="w-40 rounded border border-white/30 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/50 focus:border-white/60 focus:outline-none"
            />
          </form>
          {user.rolle === "ADMIN" && (
            <Link href="/benutzer" className="text-xs opacity-80 hover:opacity-100">
              Benutzer
            </Link>
          )}
          <span className="opacity-90">
            {user.name} · {user.tenantName}
            {user.rolle === "LESER" && (
              <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                Lesezugriff
              </span>
            )}
          </span>
          <form action={abmelden}>
            <button className="rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
