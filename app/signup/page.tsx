// /signup — 이메일+비밀번호 회원가입.
// 동의가 먼저(2026-11-03 — docs/phase/my-life-restructure.md §16.3): /join 에서 동의한 서명 쿠키가 없거나 만료면 /join 으로.
// 가입 성공 시 동의 칸이 채워진 계정으로 자동 로그인 → /enter(분기).
// proxy.ts PUBLIC_PATHS 에 등록되어 비로그인 접근 가능.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readSignupConsentToken, SIGNUP_CONSENT_COOKIE } from "@/lib/signup-consent";

import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  if (!readSignupConsentToken((await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value)) redirect("/join?provider=email");
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-20">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-ink">회원가입</h1>
        <p className="mt-3 text-ink-soft">
          이메일과 비밀번호로 라이프북을 시작해요.
        </p>
      </header>

      <SignupForm />
    </main>
  );
}
