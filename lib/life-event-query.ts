// STAGE3/STAGE4 — 확인된 인생 이벤트 조회. 순수 모듈(auth 없음) — 오늘의 인터뷰·검증 스크립트가
// userId 로 직접 부른다(lib/account-deletion.ts·lib/person-chat.ts 와 같은 패턴, 2026-09-01).

import { prisma } from "./db";
import type { LifeEventType } from "./generated/prisma/enums";

export type ConfirmedEpisodeItem = {
  id: string;
  label: string;
  year: number | null;
  type: LifeEventType;
};

// 확인질문을 통과한(CONFIRMED 또는 CORRECTED — 정정도 확인된 상태, 2026-09-01 넓힘) 이벤트 단건 조회. needsReview 는
// 제외, label/year 는 정정값 우선. 오늘의 인터뷰(lib/interview/session)가 소유·상태 확인에 쓴다.
// 2026-11-03 — 목록 조회 listConfirmedLifeEvents 는 옛 온보딩 이야기 화면만 써서 삭제(§15.4).
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
