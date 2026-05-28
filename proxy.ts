// Edge 전용 라우트 보호 미들웨어 (Next 16 에선 middleware 대신 proxy.ts 규약).
// 모든 요청이 여기를 거쳐 로그인·동의 게이트를 통과한다.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "./auth.config";

// Edge 전용 NextAuth — Prisma 어댑터 없이 Node 측 인스턴스가 발급한 JWT 만
// 읽는다 (Edge 런타임은 Prisma 사용 불가).
const { auth } = NextAuth(authConfig);

// 로그인 없이 누구나 접근 가능한 페이지.
const PUBLIC_PATHS = new Set<string>(["/", "/login"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* 는 OAuth 핸드셰이크 자체라 항상 통과시켜야 한다.
  if (pathname.startsWith("/api/auth/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;

  // 비로그인 → 로그인 페이지로.
  const session = req.auth;
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // /consent 는 "로그인했지만 아직 동의 안 한" 상태로 들어갈 수 있는 유일한 페이지.
  if (pathname === "/consent") return;

  // 동의 미완료 → 동의 페이지로 (JWT 의 consentComplete 는 auth.ts 가 채움).
  if (!session.consentComplete) {
    return NextResponse.redirect(new URL("/consent", req.url));
  }
});

export const config = {
  // Next 내부 경로·정적 파일은 건너뛰고, 그 외 전부 인증/동의 게이트로.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
