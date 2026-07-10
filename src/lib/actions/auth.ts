"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";

const registrierenSchema = z.object({
  firma: z.string().min(2, "Firmenname ist erforderlich"),
  name: z.string().min(2, "Name ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
});

export async function registrieren(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = registrierenSchema.safeParse({
    firma: formData.get("firma"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { firma, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) return { error: "Diese E-Mail-Adresse ist bereits registriert." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.tenant.create({
    data: {
      name: firma,
      memberships: {
        create: {
          rolle: "ADMIN",
          user: {
            create: { email: email.toLowerCase(), name, passwordHash },
          },
        },
      },
    },
  });

  await signIn("credentials", { email, password, redirectTo: "/" });
  return {};
}

export async function anmelden(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "E-Mail oder Passwort ist falsch." };
    }
    throw err; // redirect() wirft intern – muss durchgereicht werden
  }
}

export async function abmelden() {
  await signOut({ redirect: false });
  redirect("/login");
}
