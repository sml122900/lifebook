import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config — no Prisma imports here so it can run in
// middleware. Kakao/Naver providers can be added later for Korean users.
export default {
  providers: [Google],
  callbacks: {
    // session() is reused by both the Node instance (auth.ts) and the
    // Edge instance (middleware.ts). It only reads from the already-issued
    // JWT, so it stays Prisma-free here.
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      session.consentComplete = token.consentComplete === true;
      return session;
    },
  },
} satisfies NextAuthConfig;
