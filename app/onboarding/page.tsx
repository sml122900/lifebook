import { OnboardingForm } from "./OnboardingForm";

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
