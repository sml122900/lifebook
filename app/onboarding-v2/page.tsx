import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { OnboardingV2Form } from "./OnboardingV2Form";

// STAGE1 — 신상 온보딩(생년/성별/거주지) + LifeEvent 골격 생성 진입 화면.
// 기존 /onboarding(archived → /onboarding-chat)·/onboarding-chat 과는 별도
// 라우트 — 신규 LifeEvent/OnboardingProfile 파이프라인 검증용. /enter 라우팅은
// 아직 이 경로를 가리키지 않는다(연결 여부는 STAGE1~2 검증 후 별도 결정).
export default async function OnboardingV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">잠깐 알려주세요</h1>
        <p className="mt-2 text-lg text-ink-soft">
          몇 가지 정보로 당신만의 인생 이야기 칸을 준비할게요.
        </p>
      </header>
      <OnboardingV2Form userId={session.user.id} />
    </main>
  );
}
