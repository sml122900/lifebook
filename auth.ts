import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import authConfig from "./auth.config";
import { prisma } from "./lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Node-only: hydrate the JWT with consent state from the DB so the
    // Edge middleware can decide redirects without touching Prisma.
    async jwt({ token }) {
      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            privacyConsentAt: true,
            overseasTransferConsentAt: true,
            termsConsentAt: true,
          },
        });
        token.consentComplete = !!(
          user?.privacyConsentAt &&
          user?.overseasTransferConsentAt &&
          user?.termsConsentAt
        );
      }
      return token;
    },
  },
});
