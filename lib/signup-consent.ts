// 가입 전 동의 — 동의 → 로그인/가입 → 계정 생성(2026-11-03 — docs/phase/my-life-restructure.md §16.3).
//
// 동의는 계정이 생기기 전에 받는다. 계정이 없으니 동의 사실은 서명 쿠키(SIGNUP_CONSENT_COOKIE)에 들고 있다가, 계정을
// 만드는 두 곳(소셜 = lib/auth-adapter createUser · 이메일 = lib/email-signup)이 쿠키를 확인하고 동의 칸을 같은 insert 로
// 채운다. 쿠키가 없거나 틀리면 계정을 만들지 않는다(동의 없이 계정이 생기는 경로 0).
//   쿠키 값 = "<동의 버전>.<동의 시각 ms>.<서명>" — 서명 = HMAC-SHA256(AUTH_SECRET). 개인정보 없음.
//   유효 = 서명 일치 · 버전 ≥ 현재 동의 버전 · 동의 뒤 SIGNUP_CONSENT_TTL_SEC 안.
// 이미 계정이 있는 사람의 로그인은 그대로(동의 쿠키를 보지 않음 — 기존 동의 상태 유지, 재동의 강요 없음).
// 순수 판정·서명은 이 파일, 쿠키 읽기·쓰기(next/headers)는 auth.ts·app/join·app/signup 이 한다 — 회귀가 같은 함수를 부르게.

import { createHmac, timingSafeEqual } from "node:crypto";

import { CURRENT_CONSENT_VERSION } from "./consent-version";
import { prisma } from "./db";

export const SIGNUP_CONSENT_COOKIE = "lb_signup_consent";
export const SIGNUP_CONSENT_TTL_SEC = 20 * 60; // 동의 화면 → 카카오·네이버·구글 로그인 → 돌아오기까지
export const SIGNUP_PROVIDERS = ["kakao", "naver", "google"] as const;
export type SignupProvider = (typeof SIGNUP_PROVIDERS)[number];
export const isSignupProvider = (v: unknown): v is SignupProvider => SIGNUP_PROVIDERS.includes(v as SignupProvider);

export type SignupConsent = { version: number; at: Date };

function sign(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 없음 — 가입 동의 쿠키를 서명할 수 없음");
  return createHmac("sha256", secret).update(`signup-consent:${payload}`).digest("base64url");
}

export function makeSignupConsentToken(at: Date = new Date(), version: number = CURRENT_CONSENT_VERSION): string {
  const payload = `${version}.${at.getTime()}`;
  return `${payload}.${sign(payload)}`;
}

export function readSignupConsentToken(token: string | null | undefined, now: Date = new Date()): SignupConsent | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [v, t, sig] = parts;
  const want = Buffer.from(sign(`${v}.${t}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const version = Number(v);
  const atMs = Number(t);
  if (!Number.isInteger(version) || version < CURRENT_CONSENT_VERSION || !Number.isFinite(atMs)) return null;
  const age = now.getTime() - atMs;
  if (age < -60_000 || age > SIGNUP_CONSENT_TTL_SEC * 1000) return null;
  return { version, at: new Date(atMs) };
}

// 새 계정 행에 같이 넣는 동의 칸 — 동의 화면에서 동의한 시각·버전(/consent 저장과 같은 칸).
export function signupConsentFields(c: SignupConsent) {
  return { termsConsentAt: c.at, privacyConsentAt: c.at, overseasTransferConsentAt: c.at, privacyConsentVersion: c.version };
}

// 소셜 로그인 콜백 판정(auth.ts callbacks.signIn — 계정을 만들기 전에 돈다).
//   아이디·비밀번호 로그인 → 통과(계정이 이미 있음) · 이미 이어진 소셜 계정 → 통과 ·
//   새 소셜 계정 + 유효한 동의 → 통과(어댑터가 동의 칸과 함께 만듦) · 새 소셜 계정 + 동의 없음 → 동의 화면으로(계정 안 만듦).
export async function signInGate(
  account: { type: string; provider: string; providerAccountId: string } | null | undefined,
  consent: SignupConsent | null,
): Promise<true | string> {
  if (!account || account.type === "credentials") return true;
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
    select: { id: true },
  });
  if (linked || consent) return true;
  return `/join?provider=${encodeURIComponent(account.provider)}`;
}
