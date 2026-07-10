import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      tenantName: string;
      rolle: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { include: { tenant: true } } },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        const m = user.memberships[0];
        if (!m) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: m.tenantId,
          tenantName: m.tenant.name,
          rolle: m.rolle,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          tenantId: string;
          tenantName: string;
          rolle: string;
        };
        token.sub = u.id;
        token.tenantId = u.tenantId;
        token.tenantName = u.tenantName;
        token.rolle = u.rolle;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantName = token.tenantName as string;
      session.user.rolle = token.rolle as string;
      return session;
    },
  },
});
