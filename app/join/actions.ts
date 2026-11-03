"use server";

// 가입 전 동의 제출(/join — 2026-11-03, docs/phase/my-life-restructure.md §16.3). 계정은 아직 없다.
// 필수 3종 동의를 서버에서 다시 확인하고(묵시적 동의 금지 — /consent saveConsent 와 같은 규칙), 서명 쿠키에 동의 시각·버전을
// 담은 뒤 고른 가입 방법으로 넘어간다. 계정은 소셜 로그인 콜백(lib/auth-adapter createUser)·이메일 가입(lib/email-signup)이
// 이 쿠키를 확인하고 동의 칸과 함께 만든다.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { isSignupProvider, makeSignupConsentToken, SIGNUP_CONSENT_COOKIE, SIGNUP_CONSENT_TTL_SEC } from "@/lib/signup-consent";

export async function joinAction(formData: FormData) {
  const method = formData.get("method");
  const back = isSignupProvider(method) || method === "email" ? `&provider=${method}` : "";
  if (formData.get("privacy") !== "on" || formData.get("overseas") !== "on" || formData.get("terms") !== "on") {
    redirect(`/join?error=consent${back}`);
  }
  (await cookies()).set(SIGNUP_CONSENT_COOKIE, makeSignupConsentToken(), {
    httpOnly: true,
    sameSite: "lax", // 카카오·네이버·구글에서 돌아오는 콜백(최상위 GET)에도 실림
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIGNUP_CONSENT_TTL_SEC,
  });
  if (method === "email") redirect("/signup");
  if (isSignupProvider(method)) await signIn(method, { redirectTo: "/enter" });
  redirect("/join");
}
