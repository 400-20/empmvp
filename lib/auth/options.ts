import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { OrgStatus, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  // Allow blank/null/undefined; if provided, require a UUID.
  orgId: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      if (trimmed === "" || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
        return undefined;
      }
      return trimmed;
    },
    z.string().uuid({ message: "Invalid UUID" }).optional(),
  ),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        orgId: { label: "Org Id (optional for multi-tenant)", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
          orgId: credentials?.orgId,
        });

        if (!parsed.success) {
          // prefer helper over deprecated `.flatten()`
          console.error("credentials parse error", parsed.error.flatten());
          return null;
        }

        const { email, password, orgId } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
            ...(orgId ? { orgId } : {}),
          },
          include: { org: { select: { status: true } } },
        });

        if (!user || !user.passwordHash) {
          console.log("user not found or missing password", normalizedEmail);
          return null;
        }

        if (user.status !== UserStatus.ACTIVE) {
          console.log("user inactive", user.email);
          return null;
        }

        if (user.role !== UserRole.SUPERADMIN) {
          const orgStatus = user.org?.status;
          if (!orgStatus || orgStatus === OrgStatus.DELETED || orgStatus === OrgStatus.SUSPENDED) {
            console.log("org inactive/deleted", user.email, orgStatus);
            return null;
          }
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        console.log("credential attempt", email, "valid?", valid);
        if (!valid) {
          console.error("invalid password for", email);
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          managerId: user.managerId,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session?.user) {
        token.orgId = session.user.orgId ?? token.orgId;
        token.role = (session.user.role as UserRole) ?? token.role;
        token.managerId = session.user.managerId ?? token.managerId;
        token.status = (session.user.status as UserStatus) ?? token.status;
        token.orgStatus = (session.user as any)?.orgStatus ?? token.orgStatus;
      }

      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role as UserRole;
        token.orgId = user.orgId;
        token.managerId = user.managerId;
        token.status = user.status as UserStatus;
        token.orgStatus = (user as any)?.org?.status as OrgStatus | undefined;
      } else if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { org: { select: { status: true } } },
        });

        if (dbUser) {
          token.email = dbUser.email;
          token.name = dbUser.name ?? token.name;
          token.role = dbUser.role;
          token.orgId = dbUser.orgId;
          token.managerId = dbUser.managerId;
          token.status = dbUser.status;
          token.orgStatus = dbUser.org?.status;
        } else {
          token.status = UserStatus.SUSPENDED;
          token.orgStatus = OrgStatus.DELETED;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string | undefined;
        session.user.name = token.name as string | undefined;
        session.user.role = token.role as UserRole;
        session.user.orgId = token.orgId as string | undefined;
        session.user.managerId = token.managerId as string | undefined;
        session.user.status = token.status as UserStatus;
        (session.user as any).orgStatus = token.orgStatus as OrgStatus | undefined;
      }

      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (!token?.sessionToken) return;
      await prisma.session.deleteMany({ where: { sessionToken: token.sessionToken } }).catch(() => {});
    },
  },
};

export const authHandler = NextAuth(authOptions);
