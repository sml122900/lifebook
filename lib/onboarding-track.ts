// v3 P17 — 온보딩 트랙(V2/V3) 조회. /enter·/start·/chat-v3·/story-review·
// /onboarding-chat·사이드 패널이 모두 같은 판단 기준을 쓰도록 단일 헬퍼로 묶는다.
import type { OnboardingTrack } from "./generated/prisma/enums";
import { prisma } from "./db";

export async function getOnboardingTrack(userId: string): Promise<OnboardingTrack> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingTrack: true },
  });
  return user?.onboardingTrack ?? "V2";
}
