import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOnboardingTrack } from "@/lib/onboarding-track";

import OnboardingChatClient from "./OnboardingChatClient";

// 채팅 온보딩(v2 파이프라인) 진입. onboardingCompletedAt 이 이미 찍혀있으면
// 메인으로. v3 P17 — V3 사용자 직접 URL 진입은 /enter 로 돌려보낸다(v2 게이트
// 대상 아님, /enter 가 신규가입을 이미 /start 로 보내므로 자연 분기에선 안
// 걸리지만 직접 접근 방어).
export default async function OnboardingChatPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const track = await getOnboardingTrack(session.user.id);
  if (track === "V3") redirect("/enter");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true },
  });
  if (user?.onboardingCompletedAt) redirect("/life-timeline");

  return <OnboardingChatClient />;
}
