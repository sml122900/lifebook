import { redirect } from "next/navigation";

import { OnboardingForm } from "./OnboardingForm";

// Lifebook v3 — 레거시 /onboarding 비활성화 (위저드형 온보딩).
//
// 신규 가입은 /enter → /onboarding-chat(채팅 온보딩)로 통일됐다. 이 라우트는
// 직접 URL·OnboardingForm 의 옛 완료 동선(push("/timeline"))을 거쳐 들어와도
// 채팅 온보딩으로 흡수한다. 코드 보존: _OnboardingPageArchived + OnboardingForm
// 무수정(부활 시 default export 만 교체). lib/onboarding/questions 는 채팅
// 온보딩·회원정보 화면과 공유라 그대로 살아있다.
export default function OnboardingPage() {
  redirect("/onboarding-chat");
}

function _OnboardingPageArchived() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">잠깐 알려주세요</h1>
        <p className="mt-2 text-ink-soft">
          몇 가지 정보로 당신만의 연혁표를 준비할게요. 답하기 어려운 건 언제든
          건너뛰셔도 됩니다.
        </p>
      </header>
      <OnboardingForm />
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __preserve_archived_exports = {
  _OnboardingPageArchived,
};
