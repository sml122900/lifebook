import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import authConfig from "./auth.config";
import { prisma } from "./lib/db";
import { ensureWalletWithSignupGrant } from "./lib/tokens/wallet";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  events: {
    // Auth.js fires createUser exactly once — when the PrismaAdapter
    // first inserts the user. Phase 8.2 signup grant lands here and
    // ensureWalletWithSignupGrant is idempotent so even if this fires
    // unexpectedly (e.g. account-linking edge cases) the grant only
    // happens once.
    async createUser({ user }) {
      if (user.id) {
        await ensureWalletWithSignupGrant(user.id);
      }
    },
  },
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

        // Backstop for users that existed before Phase 8.2 shipped
        // (createUser already fired for them, so they'd otherwise stay
        // wallet-less). The call is idempotent — anyone who already
        // has a wallet pays a single SELECT and returns.
        await ensureWalletWithSignupGrant(token.sub);
      }
      return token;
    },
  },
});
