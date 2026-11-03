"use server";
import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { createEmailAccount } from "@/lib/email-signup";
import { readSignupConsentToken, SIGNUP_CONSENT_COOKIE } from "@/lib/signup-consent";

// 이메일 가입 — 동의가 먼저(2026-11-03, docs/phase/my-life-restructure.md §16.3). /join 에서 동의한 서명 쿠키가 있어야
// 계정을 만든다(본체 lib/email-signup — 동의 칸을 같은 insert 로). 없거나 만료면 /join 으로.
export async function signupAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  const jar = await cookies();
  const consent = readSignupConsentToken(jar.get(SIGNUP_CONSENT_COOKIE)?.value);
  if (!consent) redirect("/join?provider=email");

  const password = (formData.get("password") as string) ?? "";
  const r = await createEmailAccount(
    { email: formData.get("email"), password, name: formData.get("name") },
    consent,
  );
  if (!r.ok) return r.error;
  jar.delete(SIGNUP_CONSENT_COOKIE); // 동의는 한 번만(같은 기기 다음 가입에 다시 쓰이지 않게)

  // 가입 직후 자동 로그인 — 성공 시 /enter 로 redirect(NEXT_REDIRECT 재throw)
  try {
    await signIn("credentials", { email: r.email, password, redirectTo: "/enter" });
  } catch (e) {
    if (e instanceof AuthError) {
      // 자동 로그인 실패는 드문 경우 — 로그인 페이지로 유도
      return "가입은 완료됐어요. 아래 로그인 페이지에서 계속해주세요.";
    }
    throw e; // NEXT_REDIRECT
  }
  return null; // unreachable
}
