import NextAuth from "next-auth";

import authConfig from "./auth.config";

// Prisma adapter is wired in Phase 3.2 once Account/Session models exist.
// Until then, sessions live in JWT cookies and no User row is persisted.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  ...authConfig,
});
