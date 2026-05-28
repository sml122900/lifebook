import { OnboardingForm } from "./OnboardingForm";

// 온보딩 페이지. 신규 사용자가 처음 도달(타임라인 진입 시 미완료면 여기로).
// 실제 질문 흐름은 OnboardingForm(클라)이 lib/onboarding/questions 로 구동.
export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-900">잠깐 알려주세요</h1>
        <p className="mt-2 text-zinc-700">
          몇 가지 정보로 당신만의 연혁표를 준비할게요. 답하기 어려운 건 언제든
          건너뛰셔도 됩니다.
        </p>
      </header>
      <OnboardingForm />
    </main>
  );
}
