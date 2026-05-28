// 동기부여 ① 검증 — getTimemachineProgress / getFilledMonthKeys 가
// 기존 T6 데이터를 정확히 집계하는지 + Phase 7(ai_chat/manual) 행은
// 절대 세지 않는지.
//
// 시나리오 (한 테스트 사용자):
//   - 2026-05: 사건 2건 (메모 "abc" + "") + 회고 "회고글12" → filled, 사건2, 회고O
//   - 2026-04: 사건 1건 (메모 "x") , 회고 없음 → filled, 사건1, 회고X
//   - 2026-03: 회고만 "삼월" → filled, 사건0, 회고O
//   - 2026-02: ai_chat 1건 + manual 1건 → NOT filled (집계 제외)
//   기대: filledMonths=3, totalEvents=3, totalChars = 3(abc)+0+8(회고글12=4자? 계산)+1(x)+2(삼월)

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  getFilledMonthKeys,
  getTimemachineProgress,
  monthKey,
} from "../lib/timemachine-progress";

const EVENT = "timemachine_event";
const MONTH = "timemachine_month";

async function main() {
  const user = await prisma.user.create({
    data: { email: `prog-${Date.now()}@test`, name: "progress-tester" },
  });

  // 집계에 쓸 MonthEvent id 2개 (2026-05). 없으면 monthEventId=null 로도 무방
  // (집계는 createdVia 만 봄) — 안전하게 있으면 연결.
  const evRows = await prisma.monthEvent.findMany({
    where: { year: 2026, month: 5 },
    select: { id: true },
    take: 2,
  });

  try {
    // 2026-05 — 사건 2 + 회고
    await prisma.userMemory.createMany({
      data: [
        {
          userId: user.id,
          year: 2026,
          month: 5,
          monthEventId: evRows[0]?.id ?? null,
          title: "사건A",
          content: "abc", // 3자
          createdVia: EVENT,
        },
        {
          userId: user.id,
          year: 2026,
          month: 5,
          monthEventId: evRows[1]?.id ?? null,
          title: "사건B",
          content: null, // 0자 (남기기만)
          createdVia: EVENT,
        },
        {
          userId: user.id,
          year: 2026,
          month: 5,
          title: "2026년 5월 회고",
          content: "회고글입니다", // 6자
          createdVia: MONTH,
        },
      ],
    });

    // 2026-04 — 사건 1, 회고 없음
    await prisma.userMemory.create({
      data: {
        userId: user.id,
        year: 2026,
        month: 4,
        title: "사건C",
        content: "x", // 1자
        createdVia: EVENT,
      },
    });

    // 2026-03 — 회고만
    await prisma.userMemory.create({
      data: {
        userId: user.id,
        year: 2026,
        month: 3,
        title: "2026년 3월 회고",
        content: "삼월", // 2자
        createdVia: MONTH,
      },
    });

    // 2026-02 — Phase 7 행 (집계 제외 대상)
    await prisma.userMemory.createMany({
      data: [
        {
          userId: user.id,
          year: 2026,
          month: 2,
          title: "ai_chat 추억",
          content: "이건 세면 안 됨",
          createdVia: "ai_chat",
        },
        {
          userId: user.id,
          year: 2026,
          month: 2,
          title: "manual 추억",
          content: "이것도 제외",
          createdVia: "manual",
        },
      ],
    });

    const progress = await getTimemachineProgress(user.id);
    const filledKeys = await getFilledMonthKeys(user.id);

    const cell = (y: number, m: number) =>
      progress.cells.find((c) => c.year === y && c.month === m);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    console.log("=== 동기부여 ① 진척 집계 ===");
    console.log(
      `  filledMonths=${progress.filledMonths} totalEvents=${progress.totalEvents} totalChars=${progress.totalChars} totalMonths=${progress.totalMonths}`,
    );

    check("시드 범위 12개월", progress.totalMonths === 12);
    check("채운 달 3개월", progress.filledMonths === 3);
    check("남긴 사건 총 3개", progress.totalEvents === 3);
    // 3(abc) + 0 + 6(회고글입니다) + 1(x) + 2(삼월) = 12
    check("쓴 글자 총 12자", progress.totalChars === 12);

    // 달별 셀 정확성
    const c0505 = cell(2026, 5);
    const c0404 = cell(2026, 4);
    const c0303 = cell(2026, 3);
    const c0202 = cell(2026, 2);
    const c2512 = cell(2025, 12);
    check(
      "2026-05 채움 + 사건2 + 회고O",
      !!c0505 && c0505.filled && c0505.eventCount === 2 && c0505.hasStory,
    );
    check(
      "2026-04 채움 + 사건1 + 회고X",
      !!c0404 && c0404.filled && c0404.eventCount === 1 && !c0404.hasStory,
    );
    check(
      "2026-03 채움 + 사건0 + 회고O",
      !!c0303 && c0303.filled && c0303.eventCount === 0 && c0303.hasStory,
    );
    check(
      "2026-02 비움 (ai_chat/manual 제외)",
      !!c0202 && !c0202.filled && c0202.eventCount === 0,
    );
    check("2025-12 비움 (기록 전혀 없음)", !!c2512 && !c2512.filled);

    // filledKeys 정확성 (월 화면 배지용)
    check("filledKeys 에 2026-5 포함", filledKeys.has(monthKey(2026, 5)));
    check("filledKeys 에 2026-4 포함", filledKeys.has(monthKey(2026, 4)));
    check("filledKeys 에 2026-3 포함", filledKeys.has(monthKey(2026, 3)));
    check("filledKeys 에 2026-2 미포함", !filledKeys.has(monthKey(2026, 2)));
    check("filledKeys 크기 3", filledKeys.size === 3);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
