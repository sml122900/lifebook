// CUSTOM LifeEvent(사용자가 직접 꺼낸 시기) 생성. 순수 모듈(auth 없음).
// 처음엔 P13-4(b) "open 모드 자유 발화 승격"(한 턴 분류 → 즉시 CUSTOM 생성)의 일부였다. My Life 개편
// 2단계부터 즉시 승격은 없고, 제안 카드 [만들기]가 새 시기를 만들 때(lib/node-proposal.ts) 이 함수만 쓴다.

import { prisma } from "./db";

// CUSTOM LifeEvent 생성 — 처음부터 CONFIRMED(본인이 직접 꺼낸 이야기라
// 확인질문이 필요 없다). 자리(sequenceOrder):
//   - 연도 있음 → 연도가 그 이하인 마지막 이벤트 바로 뒤(뒤 이벤트들은 +1
//     밀림). 타임라인/갭 감지/확인질문 조회가 전부 sequenceOrder 순이라
//     연도순 자리를 여기서 잡아줘야 /story-review 에서 제자리에 보인다.
//   - 연도 없음 → 맨 뒤(사용자 결정: "시기 미상 섹션" 대신 맨 뒤).
export async function createCustomLifeEvent(
  userId: string,
  title: string,
  year: number | null,
): Promise<{ id: string; label: string; year: number | null }> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId },
    orderBy: { sequenceOrder: "asc" },
    select: { sequenceOrder: true, year: true, correctedYear: true },
  });
  const maxOrder = events.length ? events[events.length - 1].sequenceOrder : -1;

  let sequenceOrder = maxOrder + 1;
  if (year !== null) {
    let anchorOrder: number | null = null;
    for (const e of events) {
      const y = e.correctedYear ?? e.year;
      if (y !== null && y <= year) anchorOrder = e.sequenceOrder;
    }
    if (anchorOrder !== null && anchorOrder < maxOrder) {
      sequenceOrder = anchorOrder + 1;
      await prisma.lifeEvent.updateMany({
        where: { userId, sequenceOrder: { gt: anchorOrder } },
        data: { sequenceOrder: { increment: 1 } },
      });
    }
  }

  const created = await prisma.lifeEvent.create({
    data: {
      userId,
      type: "CUSTOM",
      label: title,
      year,
      isOptional: true,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder,
    },
    select: { id: true, label: true, year: true },
  });
  return created;
}
