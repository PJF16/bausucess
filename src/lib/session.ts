import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Angemeldeter Benutzer mit LIVE geprüfter Mitgliedschaft: Rolle und
 * Mandantenzugehörigkeit kommen aus der Datenbank, nicht aus dem JWT.
 * Ein entfernter oder umgestufter Benutzer verliert damit sofort seinen
 * Zugriff – nicht erst, wenn sein Token abläuft.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: session.user.id,
        tenantId: session.user.tenantId,
      },
    },
    select: { rolle: true },
  });
  if (!membership) redirect("/login");
  return { ...session.user, rolle: membership.rolle };
}

/** Für schreibende Aktionen: LESER dürfen nicht ändern. */
export async function requireBearbeiter() {
  const user = await requireUser();
  if (user.rolle === "LESER") {
    throw new Error("Keine Berechtigung – Ihr Konto hat nur Lesezugriff.");
  }
  return user;
}

/** Für Verwaltungsaufgaben (Benutzer, Rollen). */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.rolle !== "ADMIN") {
    throw new Error("Keine Berechtigung – nur für Administratoren.");
  }
  return user;
}
