"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 코치마크 둘러보기 완료 표시 — 사용자가 끝까지 보거나 "건너뛰기" 했을 때.
// 한 번 완료하면 첫 진입 자동 표시가 안 뜬다(재실행은 ?tour= 로 강제).
//
// 멱등 + race-safe: array_append(array_remove(...)) 단일 statement 로 중복
// 없이 추가(skippedLifeCategories H2 와 같은 패턴). 게이트는 다음 풀로드에서만
// 의미가 있고 클라가 이미 투어를 닫았으므로 revalidate 불필요.
export async function markTourCompletedAction(tourId: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.$executeRaw`
    UPDATE "User"
    SET "completedTours" = array_append(array_remove("completedTours", ${tourId}), ${tourId})
    WHERE id = ${session.user.id}
  `;
}
