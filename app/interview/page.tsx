import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { prisma } from "@/lib/db";
import { enforceInterviewPage } from "@/lib/interview/gate";
import { getInitialInterviewState } from "@/lib/interview/session";
import { getOnboardingTrack } from "@/lib/onboarding-track";

import { InterviewClient } from "./InterviewClient";

// 오늘의 인터뷰(1차) — docs/phase/today-interview.md. 하루 1세션, 한 화면 한 질문.
// 게이트(허용 목록) → V3 트랙 → 동의 버전(답이 Anthropic 으로 국외이전) → 골격 완료
// 순서. 골격 확인질문이 남았으면 그게 먼저라 /chat-v3 로 보낸다.
export default async function InterviewPage() {
  const session = await auth();
  const userId = enforceInterviewPage(session?.user?.id);
  if ((await getOnboardingTrack(userId)) !== "V3") redirect("/enter");
  if ((session?.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");

  const [profile, unconfirmed] = await Promise.all([
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { skeletonGeneratedAt: true } }),
    prisma.lifeEvent.count({ where: { userId, status: "UNCONFIRMED" } }),
  ]);
  if (!profile?.skeletonGeneratedAt || unconfirmed > 0) redirect("/chat-v3");

  const initial = await getInitialInterviewState(userId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <InterviewClient initial={initial} />
    </main>
  );
}
