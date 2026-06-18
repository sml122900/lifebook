// Edge 전용 라우트 보호 미들웨어 (Next 16 에선 middleware 대신 proxy.ts 규약).
// 모든 요청이 여기를 거쳐 로그인·동의 게이트를 통과한다.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import authConfig from "./auth.config";
import { CURRENT_CONSENT_VERSION } from "./lib/consent-version";

// Edge 전용 NextAuth — Prisma 어댑터 없이 Node 측 인스턴스가 발급한 JWT 만
// 읽는다 (Edge 런타임은 Prisma 사용 불가).
const { auth } = NextAuth(authConfig);

// 로그인 없이 누구나 접근 가능한 페이지.
// /opengraph-image — 카카오톡·문자 링크 미리보기 크롤러가 받아가는 OG 썸네일.
// 점(.) 없는 경로라 matcher 에 안 걸러져 여기서 명시 공개해야 한다(미지정 시
// 크롤러가 이미지 대신 /login 리다이렉트를 받아 미리보기가 안 뜸).
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/opengraph-image",
]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* 는 OAuth 핸드셰이크 자체라 항상 통과시켜야 한다.
  if (pathname.startsWith("/api/auth/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;

  // 상점 둘러보기는 비로그인 허용 — 랜딩 S3·S4 에서 상품을 바로 볼 수 있게.
  // /shop(목록)·/shop/<id>(상세)만 공개. 주문·결제(/shop/<id>/order,
  // /shop/order/*)는 2단 경로라 여기 안 걸리고 아래 로그인 게이트를 탄다.
  // 공개 페이지들은 순수 상수 렌더라 auth() 호출이 없어 비로그인에 안전.
  if (pathname === "/shop" || /^\/shop\/[^/]+$/.test(pathname)) return;

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

  // 동의 버전이 현재 버전보다 낮으면 재동의 요청.
  // (수집 항목 변경 시 CURRENT_CONSENT_VERSION 을 올리면 기존 동의자가 재노출됨)
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    return NextResponse.redirect(new URL("/consent", req.url));
  }
});

export const config = {
  // Next 내부 경로·정적 파일은 건너뛰고, 그 외 전부 인증/동의 게이트로.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
