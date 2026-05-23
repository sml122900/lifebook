import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "./auth.config";

// Edge-only NextAuth — does not include the Prisma adapter, only reads
// the JWT issued by the Node-side instance.
const { auth } = NextAuth(authConfig);

// Pages everyone can reach without logging in.
const PUBLIC_PATHS = new Set<string>(["/", "/login"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* must always be reachable for the OAuth handshake itself.
  if (pathname.startsWith("/api/auth/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;

  const session = req.auth;
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // /consent is the one authenticated page reachable without consent yet.
  if (pathname === "/consent") return;

  if (!session.consentComplete) {
    return NextResponse.redirect(new URL("/consent", req.url));
  }
});

export const config = {
  // Skip Next internals and common static files; everything else flows
  // through the auth/consent gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
