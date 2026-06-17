// /signup — 이메일+비밀번호 회원가입.
// 가입 성공 시 자동 로그인 → /enter(분기) → /consent(동의) → /life-timeline.
// proxy.ts PUBLIC_PATHS 에 등록되어 비로그인 접근 가능.
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
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
