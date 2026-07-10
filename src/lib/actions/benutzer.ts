"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { Rolle } from "@prisma/client";

const anlegenSchema = z.object({
  name: z.string().min(2, "Name ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
  rolle: z.enum(["ADMIN", "BEARBEITER", "LESER"]),
});

export async function benutzerAnlegen(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const parsed = anlegenSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    rolle: formData.get("rolle"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, rolle } = parsed.data;

  const vorhandener = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (vorhandener) {
    return { error: "Diese E-Mail-Adresse ist bereits registriert." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      passwordHash,
      memberships: { create: { tenantId: admin.tenantId, rolle } },
    },
  });
  revalidatePath("/benutzer");
  return {};
}

export async function rolleAendern(membershipId: string, rolle: Rolle) {
  const admin = await requireAdmin();
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: admin.tenantId },
  });
  if (!membership) throw new Error("Mitglied nicht gefunden");

  // Der letzte Admin darf sich nicht selbst herabstufen
  if (membership.rolle === "ADMIN" && rolle !== "ADMIN") {
    const admins = await prisma.membership.count({
      where: { tenantId: admin.tenantId, rolle: "ADMIN" },
    });
    if (admins <= 1) {
      throw new Error("Der letzte Administrator kann nicht herabgestuft werden");
    }
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { rolle },
  });
  revalidatePath("/benutzer");
}

export async function benutzerEntfernen(membershipId: string) {
  const admin = await requireAdmin();
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: admin.tenantId },
  });
  if (!membership) return;
  if (membership.userId === admin.id) {
    throw new Error("Sie können sich nicht selbst entfernen");
  }
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath("/benutzer");
}
