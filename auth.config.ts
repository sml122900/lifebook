import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config — no Prisma imports here so it can run in
// middleware. Kakao/Naver providers can be added later for Korean users.
export default {
  providers: [Google],
  callbacks: {
    // Expose the DB user id on session.user.id so server actions/RSCs can
    // scope queries by current user.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
