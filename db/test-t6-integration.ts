// Phase T6 검증 — 타임머신 저장이 UserMemory 로 들어가는지 + Phase 7
// 행은 안 깨지는지 + 가족 룸 listRoomMemories 가 타임머신 추억까지 가져
// 오는지.
//
// 시나리오:
//   1. 사용자 alice — Phase 7 추억 1건 (createdVia="ai_chat") 미리 저장
//   2. alice 가 타임머신에서 2025-08 저장 — 사건 메모 2건 + 월 회고 1건
//   3. UserMemory 행 확인: ai_chat 1건 + timemachine_event 2건 + timemachine_month 1건
//   4. 재저장 → Phase 7 행 보존 + 타임머신 행만 교체
//   5. alice + bob 의 가족 룸 — bob 이 listRoomMemories 로 alice 의 타임머신
//      추억까지 볼 수 있는지
//   6. 비운 회고로 재저장하면 timemachine_month 행 사라짐

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  loadTimemachineMonth,
  saveTimemachineMonth,
} from "../lib/timemachine-memories";
import { listRoomMemories } from "../lib/rooms";

async function main() {
  const events = await prisma.monthEvent.findMany({
    where: { year: 2025, month: 8 },
    select: { id: true, title: true },
    take: 2,
  });
  if (events.length < 2) {
    throw new Error("need 2 MonthEvent rows for 2025-08");
  }

  const alice = await prisma.user.create({
    data: { email: `t6-alice-${Date.now()}@test`, name: "alice" },
  });
  const bob = await prisma.user.create({
    data: { email: `t6-bob-${Date.now()}@test`, name: "bob" },
  });

  try {
    // 1) Phase 7 추억 1건 (year=2025, month=8 같은 달이지만 ai_chat 경로)
    const phase7Memory = await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 2025,
        month: 8,
        title: "Phase 7 가이드 대화에서 남긴 추억",
        content: "ai_chat 본문",
        createdVia: "ai_chat",
      },
      select: { id: true, createdAt: true },
    });

    // 2) 타임머신 저장
    await saveTimemachineMonth(alice.id, 2025, 8, {
      keptEvents: [
        { monthEventId: events[0].id, story: "그날의 메모" },
        { monthEventId: events[1].id, story: "" },
      ],
      monthStory: "2025년 8월은 무더웠다",
    });

    // 3) UserMemory 행 검사
    const allMemos = await prisma.userMemory.findMany({
      where: { userId: alice.id, year: 2025, month: 8 },
      select: {
        id: true,
        createdVia: true,
        monthEventId: true,
        title: true,
        content: true,
      },
      orderBy: { createdAt: "asc" },
    });
    console.log("[저장 후 UserMemory 행]");
    for (const m of allMemos) {
      console.log(
        `  ${m.createdVia.padEnd(20)} title="${m.title}" content="${m.content?.slice(0, 30) ?? "null"}" monthEventId=${m.monthEventId ?? "-"}`,
      );
    }

    const aiChatRow = allMemos.find((m) => m.createdVia === "ai_chat");
    const tmEvents = allMemos.filter(
      (m) => m.createdVia === "timemachine_event",
    );
    const tmMonth = allMemos.find(
      (m) => m.createdVia === "timemachine_month",
    );

    // 4) 재저장 — 사건 1개로 줄이고 회고 텍스트 바꿈
    await saveTimemachineMonth(alice.id, 2025, 8, {
      keptEvents: [{ monthEventId: events[0].id, story: "수정한 메모" }],
      monthStory: "다시 적은 회고",
    });
    const afterResave = await prisma.userMemory.findMany({
      where: { userId: alice.id, year: 2025, month: 8 },
      select: {
        id: true,
        createdVia: true,
        monthEventId: true,
        content: true,
      },
    });
    const phase7Still = afterResave.find((m) => m.id === phase7Memory.id);
    const tmEventsAfter = afterResave.filter(
      (m) => m.createdVia === "timemachine_event",
    );

    // 5) 가족 룸 노출
    const room = await prisma.sharedRoom.create({
      data: {
        name: "t6-room",
        ownerId: alice.id,
        members: {
          create: [
            { userId: alice.id, role: "owner", consentAt: new Date() },
            { userId: bob.id, role: "member", consentAt: new Date() },
          ],
        },
      },
    });
    const roomMemos = await listRoomMemories(room.id, bob.id);
    const bobSeesTmEvent = roomMemos?.some(
      (m) => m.title === events[0].title,
    );
    const bobSeesTmMonth = roomMemos?.some(
      (m) => m.title === "2025년 8월 회고",
    );
    const bobSeesPhase7 = roomMemos?.some(
      (m) => m.title === "Phase 7 가이드 대화에서 남긴 추억",
    );

    // 6) 회고 비우기
    await saveTimemachineMonth(alice.id, 2025, 8, {
      keptEvents: [{ monthEventId: events[0].id, story: "" }],
      monthStory: "",
    });
    const afterClearStory = await prisma.userMemory.findMany({
      where: { userId: alice.id, year: 2025, month: 8 },
      select: { createdVia: true },
    });
    const monthRowGone = !afterClearStory.some(
      (m) => m.createdVia === "timemachine_month",
    );

    // 7) load 가 같은 데이터 그대로 돌려주는지 (라운드트립)
    const loaded = await loadTimemachineMonth(alice.id, 2025, 8);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    console.log("\n=== T6 체크 ===");
    check("Phase 7 ai_chat 행 1건 존재", aiChatRow !== undefined);
    check("타임머신 사건 행 2건 생성", tmEvents.length === 2);
    check(
      "사건 행 title 이 MonthEvent.title 비정규화",
      tmEvents[0]?.title === events[0].title ||
        tmEvents[0]?.title === events[1].title,
    );
    check(
      "사건 행에 monthEventId 채워짐",
      tmEvents.every((m) => m.monthEventId !== null),
    );
    check(
      "빈 메모는 content=null 로 저장",
      tmEvents.some((m) => m.content === null),
    );
    check("월 회고 행 1건 생성", tmMonth !== undefined);
    check("월 회고 title 자동 생성", tmMonth?.title === "2025년 8월 회고");

    check(
      "재저장 후 Phase 7 행 보존",
      phase7Still !== undefined && phase7Still.content === "ai_chat 본문",
    );
    check(
      "재저장 후 타임머신 사건 1건으로 교체",
      tmEventsAfter.length === 1 && tmEventsAfter[0].content === "수정한 메모",
    );

    check("가족 룸에서 bob 이 타임머신 사건 추억 봄", bobSeesTmEvent === true);
    check("가족 룸에서 bob 이 타임머신 월 회고 봄", bobSeesTmMonth === true);
    check("가족 룸에서 bob 이 Phase 7 추억도 봄", bobSeesPhase7 === true);

    check(
      "회고 비우면 timemachine_month 행 사라짐",
      monthRowGone,
    );
    check(
      "load 라운드트립 — keptEvents 1건",
      loaded.keptEvents.length === 1,
    );
    check("load 라운드트립 — monthStory 빈문자열", loaded.monthStory === "");
  } finally {
    // 정리 — Cascade 로 한 번에.
    await prisma.user.delete({ where: { id: alice.id } });
    await prisma.user.delete({ where: { id: bob.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
