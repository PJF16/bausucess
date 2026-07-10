import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  BenutzerVerwaltung,
  type Mitglied,
} from "@/components/benutzer-verwaltung";

export default async function BenutzerPage() {
  const user = await requireUser();
  if (user.rolle !== "ADMIN") redirect("/");

  const memberships = await prisma.membership.findMany({
    where: { tenantId: user.tenantId },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  const mitglieder: Mitglied[] = memberships.map((m) => ({
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    rolle: m.rolle,
    istIch: m.userId === user.id,
  }));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-bold">Benutzer</h1>
      <p className="mb-4 text-sm text-slate-500">
        Benutzer Ihrer Firma und ihre Rollen: <strong>Admin</strong> verwaltet
        Benutzer, <strong>Bearbeiter</strong> darf alles bearbeiten,{" "}
        <strong>Leser</strong> hat nur Lesezugriff.
      </p>
      <BenutzerVerwaltung mitglieder={mitglieder} />
    </div>
  );
}
