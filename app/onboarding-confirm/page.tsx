import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { ConfirmClient } from "./ConfirmClient";

// STAGE2 — 골격 LifeEvent 확인질문 채팅 화면. STAGE1(/onboarding-v2) 완료 직후
// 자동으로 이 라우트로 넘어온다. /enter 라우팅은 아직 이 경로를 가리키지
// 않는다(연결 여부는 STAGE1~3 검증 후 별도 결정).
export default async function OnboardingConfirmPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">확인할게요</h1>
        <p className="mt-2 text-lg text-ink-soft">
          만들어진 이야기 칸을 하나씩 같이 확인해요.
        </p>
      </header>
      <ConfirmClient userId={session.user.id} />
    </main>
  );
}
