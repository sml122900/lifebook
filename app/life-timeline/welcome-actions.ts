"use server";

// 첫 방문 환영 카드(WelcomeCard) 닫기/시작하기 — 둘 다 1회성 종료 표시.
//
// 기존 User.onboardingCompletedAt 재사용 (새 컬럼/마이그 0). 의미가 "온보딩
// 끝(완료 또는 전부 건너뜀)" 이라 환영 카드 닫기와 일치 — 신규 v3 사용자는
// 레거시 /onboarding 을 안 거쳐 이 필드가 null 로 남아 있었다. 찍어 두면
// 레거시 /timeline 의 온보딩 리다이렉트도 안 타게 되는데 그게 바람직.
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function dismissWelcomeAction() {
  const session = await auth();
  if (!session?.user?.id) return;

  // 이미 찍힌 사용자(레거시 온보딩 완료)는 덮어쓰지 않는다 — updateMany
  // where null 조건으로 원래 시각 보존.
  await prisma.user.updateMany({
    where: { id: session.user.id, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  revalidatePath("/life-timeline");
}
