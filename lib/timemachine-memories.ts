// Phase T6 — 타임머신 한 달치를 UserMemory 행 N+1 개로 저장 (Phase 7
// 추억 저장과 동일 테이블 재사용).
//
// 한 달 (userId, year, month) 에 다음 행들이 생긴다:
//   - createdVia="timemachine_event" : 남긴 사건 하나당 1 row.
//     monthEventId 가 채워지고, title 은 MonthEvent.title 비정규화 사본,
//     content 는 사건별 짧은 메모(빈 문자열 허용).
//   - createdVia="timemachine_month" : 그 달 전체 회고. monthEventId=null,
//     title="YYYY년 M월 회고", content 는 회고 본문 (비면 row 생략).
//
// 외부 API (loadTimemachineMonth / saveTimemachineMonth) 시그니처는 T3
// 보완과 동일하게 유지 — MonthForm/page.tsx 가 그대로 작동.
//
// Idempotent re-save: 트랜잭션 내부에서 createdVia in (timemachine_event,
// timemachine_month) AND year/month 만 deleteMany 후 재삽입. Phase 7 의
// "ai_chat" / "manual" 행은 절대 건드리지 않는다.
//
// 가족 룸 공유 흐름 (lib/rooms.ts listRoomMemories): createdVia 와 무관
// 하게 UserMemory 를 읽으므로 타임머신 저장이 자동으로 가족에게 노출됨.

import { prisma } from "./db";

export type KeptEvent = {
  monthEventId: string;
  story: string; // 빈 문자열 허용 (남기기만 누른 사건)
};

export type TimemachineMonthData = {
  keptEvents: KeptEvent[];
  monthStory: string;
};

// 타임머신 진척(timemachine-progress)도 같은 디스크리미네이터로 집계하므로
// 여기서 단일 정의하고 export — 두 곳 중복을 단일 출처로 통합.
export const CREATED_VIA_EVENT = "timemachine_event";
export const CREATED_VIA_MONTH = "timemachine_month";

export async function loadTimemachineMonth(
  userId: string,
  year: number,
  month: number,
): Promise<TimemachineMonthData> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      year,
      month,
      createdVia: { in: [CREATED_VIA_EVENT, CREATED_VIA_MONTH] },
    },
    select: {
      monthEventId: true,
      content: true,
      createdVia: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const keptEvents: KeptEvent[] = [];
  let monthStory = "";

  for (const r of rows) {
    if (r.createdVia === CREATED_VIA_EVENT && r.monthEventId !== null) {
      keptEvents.push({
        monthEventId: r.monthEventId,
        story: r.content ?? "",
      });
    } else if (r.createdVia === CREATED_VIA_MONTH) {
      // 여러 행이 있을 가능성은 없지만 마지막을 채택.
      monthStory = r.content ?? "";
    }
  }

  return { keptEvents, monthStory };
}

export async function saveTimemachineMonth(
  userId: string,
  year: number,
  month: number,
  data: TimemachineMonthData,
): Promise<void> {
  if (!Number.isInteger(year) || year < 1900) {
    throw new Error("invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid month");
  }

  // 사건 메모 정제 — 알려진 MonthEvent id 만 통과, 중복 제거, story 트림.
  const ids = Array.from(new Set(data.keptEvents.map((k) => k.monthEventId)));
  const validRows = await prisma.monthEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  const titleById = new Map(validRows.map((r) => [r.id, r.title]));

  const cleanKept: KeptEvent[] = data.keptEvents
    .filter((k) => titleById.has(k.monthEventId))
    .map((k) => ({ monthEventId: k.monthEventId, story: k.story.trim() }))
    // 같은 monthEventId 가 두 번 들어오면 마지막을 채택.
    .reduce<KeptEvent[]>((acc, cur) => {
      const i = acc.findIndex((x) => x.monthEventId === cur.monthEventId);
      if (i >= 0) acc[i] = cur;
      else acc.push(cur);
      return acc;
    }, []);

  const monthStory = data.monthStory.trim();

  await prisma.$transaction(async (tx) => {
    // 1) 이전 타임머신 저장만 삭제 — Phase 7 ("ai_chat"/"manual") 은 보존.
    await tx.userMemory.deleteMany({
      where: {
        userId,
        year,
        month,
        createdVia: { in: [CREATED_VIA_EVENT, CREATED_VIA_MONTH] },
      },
    });

    // 2) 남긴 사건 행들.
    if (cleanKept.length > 0) {
      await tx.userMemory.createMany({
        data: cleanKept.map((k) => ({
          userId,
          monthEventId: k.monthEventId,
          year,
          month,
          // 비정규화 — MonthEvent 가 삭제돼도 추억 제목 보존.
          title: titleById.get(k.monthEventId) ?? "기억한 사건",
          content: k.story === "" ? null : k.story,
          createdVia: CREATED_VIA_EVENT,
        })),
      });
    }

    // 3) 그 달 전체 회고 — 본문 있을 때만.
    if (monthStory !== "") {
      await tx.userMemory.create({
        data: {
          userId,
          year,
          month,
          title: `${year}년 ${month}월 회고`,
          content: monthStory,
          createdVia: CREATED_VIA_MONTH,
        },
      });
    }
  });
}
