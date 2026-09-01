// P7-7 — /chat-v3 재진입 시 episode/person 단계의 대기 맥락 복원. 순수 모듈
// (auth 없음) — app/actions/chat-v3-pending.ts 가 감싸서 클라에 노출한다.
//
// 행의 존재 자체가 "미완료 대기 대화가 있다"는 신호(사용자당 1행,
// FamilyFeedSeen 과 같은 싱글턴 패턴). confirm/profile 단계는 여전히
// LifeEvent/OnboardingProfile 실제 상태에서 재계산(기존 그대로) — 이
// 테이블은 episode/person 만 다룬다.
//
// 이전 turn 히스토리는 의도적으로 저장하지 않는다 — 이탈은 대부분 "봇 질문
// 직후"라 잃을 턴이 없고, 여러 턴 중 끊긴 경우도 직전 질문 하나만 이어받는
// 게 지금(답이 사라지는 것)보다 낫다는 판단(2026-09-02 합의).

import { prisma } from "./db";
import type { ChatV3PendingStage } from "./generated/prisma/enums";

export type PendingChatContext = {
  stage: ChatV3PendingStage;
  targetEventId: string;
  targetPersonId: string | null;
};

// episode/person 단계 진입 시(startEpisodeStage/startPersonStage/
// enterPersonEpisode) 호출 — 같은 사용자의 이전 행이 있으면 덮어쓴다.
export async function setPendingChatContext(
  userId: string,
  stage: ChatV3PendingStage,
  targetEventId: string,
  targetPersonId: string | null = null,
): Promise<void> {
  await prisma.chatV3PendingContext.upsert({
    where: { userId },
    create: { userId, stage, targetEventId, targetPersonId },
    update: { stage, targetEventId, targetPersonId },
  });
}

// episode/person 을 벗어나는 모든 지점(enterOpenStage, confirm 재진입,
// period 진입 등)에서 호출 — 없어도 안전한 no-op.
export async function clearPendingChatContext(userId: string): Promise<void> {
  await prisma.chatV3PendingContext.deleteMany({ where: { userId } });
}

export async function getPendingChatContext(
  userId: string,
): Promise<PendingChatContext | null> {
  return prisma.chatV3PendingContext.findUnique({
    where: { userId },
    select: { stage: true, targetEventId: true, targetPersonId: true },
  });
}
