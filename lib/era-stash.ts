// Phase E2 — 시대 사건 "내 연혁에 담기" 헬퍼.
//
// 동작: 사용자가 /era 둘러보기에서 시대 사건 카드를 누르면 그 MonthEvent
// 내용을 사용자의 UserMemory 행 하나로 복사 (createdVia="era_event").
//
// 정책 (이미 정한 것):
//   - 같은 (사용자, MonthEvent, era_event) 중복 금지 — DB partial unique
//     index 가 단일 결정자. 코드는 P2002 catch 패턴으로 idempotent.
//   - content=null — 사용자 본인 회상 자리는 비워둠. 시대 자료(description)
//     는 monthEventId FK join 으로 표시. 본인 회상 작성 UI 는 E3 후속.
//   - precision=EXACT — 시대 사건은 그 해 일어난 게 확정 (month null 이어도
//     "그 해" 자체는 EXACT).
//   - category=null — 시대 사건은 개인 카테고리 매핑 없음. life_event 행만
//     LifeCategory 채워짐.
//   - year/month/title 은 NOT NULL 컬럼(year)·룸 호환을 위해 MonthEvent
//     값으로 미러링. eventYear/eventMonth/eventTitle 에도 동일 값.
//   - 인물 연결 거부 — lib/people.ts 의 not_life_event 가드가 자동 처리.
//   - 가족 룸 노출 — listRoomMemories 가 createdVia 무관하게 보여줌 (자동).
//   - 비서 컨텍스트 제외 — getLifeEvents 결과를 호출자가 kind 로 filter.

import { Prisma } from "./generated/prisma/client";
import { prisma } from "./db";

export const CREATED_VIA_ERA_EVENT = "era_event";

export type StashResult = "stashed" | "already" | "not_found" | "year_missing";

// MonthEvent 한 행을 복사해 UserMemory(era_event) 행 생성.
// 같은 사용자가 같은 MonthEvent 를 두 번 누르면 P2002 → "already" 반환.
export async function stashEraEvent(
  userId: string,
  monthEventId: string,
): Promise<StashResult> {
  const me = await prisma.monthEvent.findUnique({
    where: { id: monthEventId },
    select: { id: true, year: true, month: true, title: true },
  });
  if (!me) return "not_found";
  // UserMemory.year 는 NOT NULL. MonthEvent.year 가 null 이면 담기 거부 —
  // 시대 사건 시드는 모두 year 채워져 있어 실질 도달 0, 방어 가드.
  if (me.year === null) return "year_missing";

  try {
    await prisma.userMemory.create({
      data: {
        userId,
        createdVia: CREATED_VIA_ERA_EVENT,
        monthEventId: me.id,
        year: me.year,
        month: me.month,
        title: me.title,
        content: null,
        eventTitle: me.title,
        eventYear: me.year,
        eventMonth: me.month,
        precision: "EXACT",
        category: null,
      },
    });
    return "stashed";
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // partial unique (userId, monthEventId, createdVia) 충돌 — 이미 담음.
      return "already";
    }
    throw e;
  }
}

// 같은 사용자의 era_event 행 한 줄 삭제. 없으면 count 0 (idempotent).
export async function unstashEraEvent(
  userId: string,
  monthEventId: string,
): Promise<{ removed: number }> {
  const r = await prisma.userMemory.deleteMany({
    where: { userId, monthEventId, createdVia: CREATED_VIA_ERA_EVENT },
  });
  return { removed: r.count };
}

// /era 카드에 "✓ 내 연혁에 있어요" 표시용 — 사용자가 담은 MonthEvent id 셋.
export async function getStashedEraEventIds(
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: CREATED_VIA_ERA_EVENT,
      monthEventId: { not: null },
    },
    select: { monthEventId: true },
  });
  return new Set(
    rows.map((r) => r.monthEventId).filter((id): id is string => id !== null),
  );
}
