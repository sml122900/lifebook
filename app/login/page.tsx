import { signIn } from "@/auth";

import {
  InAppBrowserGuard,
  InAppGoogleNote,
  InAppIosBanner,
} from "./InAppBrowserGuard";
import { LoginCredentialsForm } from "./LoginCredentialsForm";

// 로그인 페이지. 카카오(어르신 우선)·구글 OAuth 두 가지.
// form action(server) 으로 signIn 을 호출하고, 성공 후 /enter 로 분기한다.
// L7 — /enter 가 인생 이벤트 유무를 보고 /life-timeline 또는
// /life-record(신규) 로 분기. provider 무관 동일 동선.
//
// 인앱 브라우저(카톡·인스타 등) 대응:
//   Android — mount 즉시 Chrome intent 로 외부 열기 시도.
//   iOS     — amber 안내 배너(Safari로 열기 유도) + URL 복사 버튼.
//   공통    — 구글 버튼 아래 짧은 안내문. 카카오·네이버는 인앱에서도 작동.
export default function LoginPage() {
  return (
    <InAppBrowserGuard>
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-20">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-ink">로그인</h1>
        <p className="mt-3 text-ink">
          카카오·네이버·구글 계정으로 안전하게 시작합니다.
        </p>
      </header>

      <div className="flex w-full flex-col gap-4">
          {/* iOS 인앱 안내 배너 — 인앱이 아니면 null */}
          <InAppIosBanner />

        {/* 카카오 — 어르신 요청으로 우선 노출. 노란 #FEE500 + 검정 글자는
            카카오 로그인 브랜드 가이드 강제라 디자인 토큰 예외.
            단 시니어 규격(min-h 56px, 18px)은 유지. */}
        <form
          action={async () => {
            "use server";
            await signIn("kakao", { redirectTo: "/enter" });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-md bg-[#FEE500] px-6 py-4 text-lg font-semibold text-[#191600] hover:bg-[#FDD835] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#191600]/30 focus-visible:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="#191600"
            >
              <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.77 1.86 5.2 4.66 6.58-.15.52-.96 3.32-.99 3.54 0 0-.02.17.09.23.11.07.24.02.24.02.31-.04 3.6-2.36 4.17-2.76.6.08 1.2.13 1.83.13 5.523 0 10-3.477 10-7.77S17.523 3 12 3z" />
            </svg>
            카카오로 시작하기
          </button>
        </form>

        {/* 네이버 — 초록 #03C75A + 흰 글자. 네이버 로그인 브랜드 가이드
            강제라 디자인 토큰 예외. 시니어 규격(min-h 56px, 18px) 유지. */}
        <form
          action={async () => {
            "use server";
            await signIn("naver", { redirectTo: "/enter" });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-md bg-[#03C75A] px-6 py-4 text-lg font-semibold text-white hover:bg-[#02B350] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#03C75A]/40 focus-visible:ring-offset-2"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#ffffff"
            >
              <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            네이버로 시작하기
          </button>
        </form>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/enter" });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="min-h-[56px] w-full rounded-md border border-brand bg-surface px-6 py-4 text-lg font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Google로 시작하기
          </button>
        </form>
          {/* 인앱에서만 노출 — 구글은 외부 브라우저에서만 */}
          <InAppGoogleNote />

          {/* 구분선 */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-line" />
            <span className="text-sm text-ink-soft">또는</span>
            <hr className="flex-1 border-line" />
          </div>

          {/* 이메일·비밀번호 로그인 */}
          <LoginCredentialsForm />
      </div>
    </main>
    </InAppBrowserGuard>
  );
}
