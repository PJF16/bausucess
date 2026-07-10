import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  return session.user;
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
