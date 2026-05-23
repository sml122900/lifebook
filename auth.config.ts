import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config — no Prisma imports here so it can run in
// middleware. Kakao/Naver providers can be added later for Korean users.
export default {
  providers: [Google],
} satisfies NextAuthConfig;
