import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    consentComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    consentComplete?: boolean;
  }
}
