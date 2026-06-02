// Phase L1 검증 — UserMemory 에 life_event 디스크리미네이터로 인생
// 이벤트를 얹어도:
//   1. getLifeEvents 가 시간순(year ASC, month ASC NULLS LAST, createdAt ASC) 으로 반환
//   2. life_event 가 아닌 행(ai_chat / timemachine_event / manual)은 결과에서 제외
//   3. 기존 가족 룸 listRoomMemories 가 life_event 행도 자동으로 본다
//      (year/title 미러링이 깨지지 않았음을 확인)
//
// 실행: npx tsx db/test-life-events.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { getLifeEvents, CREATED_VIA_LIFE_EVENT } from "../lib/life-events";
import { listRoomMemories } from "../lib/rooms";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `l1-alice-${Date.now()}@test`, name: "alice" },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `l1-bob-${Date.now()}@test`, name: "bob" },
    select: { id: true },
  });

  try {
    // life_event 5건 — 정렬을 어지럽혀 넣음
    //   - 1972.3 초등 입학 (EXACT)
    //   - 1965.0 출생 (EXACT, month null → 같은 해라면 month=정확 뒤로 빠짐)
    //   - 1985.0 대학 입학(추정) (APPROXIMATE, month null)
    //   - 1985.0 첫 미팅(추정, 같은 해 두 번째 사이 이벤트 — createdAt 으로 순서)
    //   - 2020.5 결혼 (EXACT)
    // 의도한 결과 순서:
    //   1965(null) → 1972.3 → 1985(null,first) → 1985(null,second) → 2020.5
    const orderedInsert = [
      {
        year: 1972,
        month: 3,
        title: "초등학교 입학",
        precision: "EXACT" as const,
        category: "SCHOOL" as const,
      },
      {
        year: 1965,
        month: null as number | null,
        title: "출생",
        precision: "EXACT" as const,
        category: "BIRTH" as const,
      },
      {
        year: 2020,
        month: 5,
        title: "결혼",
        precision: "EXACT" as const,
        category: "RELATIONSHIP" as const,
      },
      {
        year: 1985,
        month: null,
        title: "대학교 입학",
        precision: "APPROXIMATE" as const,
        category: "SCHOOL" as const,
      },
      {
        year: 1985,
        month: null,
        title: "첫 미팅",
        precision: "APPROXIMATE" as const,
        category: "RELATIONSHIP" as const,
      },
    ];

    for (const ev of orderedInsert) {
      await prisma.userMemory.create({
        data: {
          userId: alice.id,
          createdVia: CREATED_VIA_LIFE_EVENT,
          // 미러링 — 기존 컬럼 호환
          year: ev.year,
          month: ev.month,
          title: ev.title,
          // life_event 전용
          eventTitle: ev.title,
          eventYear: ev.year,
          eventMonth: ev.month,
          precision: ev.precision,
          category: ev.category,
        },
      });
      // createdAt 차이 보장 (밀리초 단위로 다름)
      await new Promise((r) => setTimeout(r, 10));
    }

    // 비-life_event 행도 같이 — 결과에서 빠져야 함
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 1972,
        month: 3,
        title: "초등 시절 회상",
        content: "ai_chat",
        createdVia: "ai_chat",
      },
    });
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 2025,
        month: 8,
        title: "어떤 사건",
        createdVia: "timemachine_event",
      },
    });

    // 다른 사용자 행 — 절대 새지 말 것
    await prisma.userMemory.create({
      data: {
        userId: bob.id,
        createdVia: CREATED_VIA_LIFE_EVENT,
        year: 1970,
        month: 1,
        title: "bob 출생",
        eventTitle: "bob 출생",
        eventYear: 1970,
        eventMonth: 1,
        precision: "EXACT",
        category: "BIRTH",
      },
    });

    const evs = await getLifeEvents(alice.id);

    console.log("[getLifeEvents 결과]");
    for (const e of evs) {
      console.log(
        `  ${e.eventYear}${e.eventMonth ? `.${String(e.eventMonth).padStart(2, "0")}` : "     "}  ${e.precision.padEnd(11)}  ${e.category ?? "-"}  ${e.title}`,
      );
    }

    const titles = evs.map((e) => e.title);
    const expected = [
      "출생",
      "초등학교 입학",
      "대학교 입학",
      "첫 미팅",
      "결혼",
    ];

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    console.log("\n=== L1 체크 ===");
    check("life_event 5건만 반환 (ai_chat/timemachine_event 제외)", evs.length === 5);
    check(
      "정렬: 1965 < 1972.3 < 1985(null) < 1985(null) < 2020.5",
      JSON.stringify(titles) === JSON.stringify(expected),
    );
    check(
      "1985 두 사이 이벤트는 createdAt 순(대학 입학 → 첫 미팅)",
      titles.indexOf("대학교 입학") < titles.indexOf("첫 미팅"),
    );
    check(
      "다른 사용자 행은 새지 않음",
      !evs.some((e) => e.title === "bob 출생"),
    );
    check(
      "precision 기본은 EXACT/APPROXIMATE 정확히 반영",
      evs.find((e) => e.title === "출생")?.precision === "EXACT" &&
        evs.find((e) => e.title === "대학교 입학")?.precision === "APPROXIMATE",
    );
    check(
      "category enum 그대로 반환",
      evs.find((e) => e.title === "출생")?.category === "BIRTH" &&
        evs.find((e) => e.title === "결혼")?.category === "RELATIONSHIP",
    );

    // 가족 룸 호환 — life_event 행도 listRoomMemories 가 잡는다 (year/title 미러링 덕분)
    const room = await prisma.sharedRoom.create({
      data: {
        name: "l1-room",
        ownerId: alice.id,
        members: {
          create: [
            { userId: alice.id, role: "owner", consentAt: new Date() },
            { userId: bob.id, role: "member", consentAt: new Date() },
          ],
        },
      },
    });
    const roomView = await listRoomMemories(room.id, bob.id);
    const bobSeesLifeEvent = roomView?.some((m) => m.title === "초등학교 입학");
    const bobSeesMarriage = roomView?.some((m) => m.title === "결혼");
    check(
      "가족 룸: bob 이 alice 의 life_event 도 봄 (미러링 OK)",
      bobSeesLifeEvent === true && bobSeesMarriage === true,
    );
  } finally {
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
