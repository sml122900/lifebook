// STAGE3/STAGE4 — 확인된 인생 이벤트 조회. 순수 모듈(auth 없음) —
// app/actions/life-event.ts 가 auth 게이트만 씌워 재노출한다. 검증
// 스크립트가 같은 함수를 직접 호출할 수 있게 lib/account-deletion.ts·
// lib/person-chat.ts 와 같은 패턴으로 분리했다(2026-09-01).

import { prisma } from "./db";
import type { LifeEventType } from "./generated/prisma/enums";

export type ConfirmedEpisodeItem = {
  id: string;
  label: string;
  year: number | null;
  type: LifeEventType;
};

// 확인질문을 통과한(CONFIRMED 또는 CORRECTED — 정정도 확인된 상태다, 미확인이
// 아니다) 이벤트만 sequenceOrder 순으로. SKIPPED/UNCONFIRMED(needsReview
// 포함)는 제외. label/year 는 CORRECTED 반영값(correctedLabel/correctedYear
// 우선)으로 노출한다.
//
// 2026-09-01 — 원래 CONFIRMED 만 허용해 "확인질문에서 연도를 정정한" 흔한
// 경로의 이벤트가 통째로 빠졌다(v3 person/episode 갭 카드를 누르면 "들을 수
// 없나봐요" 폴백). CORRECTED 를 포함하도록 넓힘 — v2(/onboarding-episode,
// /onboarding-episode-chat)도 이 함수를 그대로 쓰므로 같은 수정이 그쪽에도
// 적용된다(의도된 것).
export async function listConfirmedLifeEvents(
  userId: string,
): Promise<ConfirmedEpisodeItem[]> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
    orderBy: { sequenceOrder: "asc" },
    select: {
      id: true,
      type: true,
      label: true,
      year: true,
      correctedLabel: true,
      correctedYear: true,
    },
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    label: e.correctedLabel ?? e.label,
    year: e.correctedYear ?? e.year,
  }));
}

// 에피소드 대화 화면 진입 시 소유·상태를 확인하며 단건 조회.
// listConfirmedLifeEvents 와 같은 필터·라벨/연도 해석 규칙.
export async function getConfirmedLifeEvent(
  userId: string,
  eventId: string,
): Promise<ConfirmedEpisodeItem | null> {
  const event = await prisma.lifeEvent.findFirst({
    where: { id: eventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
    select: {
      id: true,
      type: true,
      label: true,
      year: true,
      correctedLabel: true,
      correctedYear: true,
    },
  });
  if (!event) return null;

  return {
    id: event.id,
    type: event.type,
    label: event.correctedLabel ?? event.label,
    year: event.correctedYear ?? event.year,
  };
}
