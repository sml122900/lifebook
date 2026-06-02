// Phase L2 검증 — 인생 기록 폼의 저장 흐름이 정책대로 동작하는지.
//
// 시나리오:
//   1. 빈 상태 — getAnsweredCategories=∅, getLifeEvents=[]
//   2. BIRTH 저장(year+month) → precision=EXACT, 미러링(year/title) OK
//   3. KINDERGARTEN 저장(year만, month=null) → precision=APPROXIMATE
//   4. BIRTH 수정 → 같은 카테고리 update, 행 수 +0 (여전히 BIRTH 1행)
//   5. 같은 카테고리 두 번 저장해도 1행만 유지
//   6. getAnsweredCategories = {BIRTH, KINDERGARTEN}
//   7. 시간순 정렬 (getLifeEvents) — 작은 연도가 먼저
//   8. 가족 룸: 다른 멤버가 life_event 도 봄 (미러링 호환)
//
// 실행: npx tsx db/test-life-record-flow.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  CREATED_VIA_LIFE_EVENT,
  getAnsweredCategories,
  getLifeEventForCategory,
  getLifeEvents,
  upsertLifeEvent,
} from "../lib/life-events";
import { listRoomMemories } from "../lib/rooms";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `l2-alice-${Date.now()}@test`, name: "alice" },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `l2-bob-${Date.now()}@test`, name: "bob" },
    select: { id: true },
  });

  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
    if (!ok) failures.push(label);
  };

  try {
    // 1) 빈 상태
    const empty = await getAnsweredCategories(alice.id);
    const emptyEvs = await getLifeEvents(alice.id);
    console.log("\n[빈 상태]");
    check("getAnsweredCategories 빈 집합", empty.size === 0);
    check("getLifeEvents 빈 배열", emptyEvs.length === 0);

    // 2) BIRTH 저장 — year+month → EXACT
    console.log("\n[BIRTH 저장 (1965년 3월)]");
    const birth = await upsertLifeEvent(alice.id, "BIRTH", {
      title: "서울 종로",
      year: 1965,
      month: 3,
      endYear: null,
      content: "비 오는 날 새벽이었다고 들었어요.",
    });
    check("precision = EXACT (year+month)", birth.precision === "EXACT");

    // 미러링 확인 (DB 직접)
    const birthRow = await prisma.userMemory.findUnique({
      where: { id: birth.id },
      select: {
        year: true,
        month: true,
        title: true,
        eventYear: true,
        eventMonth: true,
        eventTitle: true,
        category: true,
        precision: true,
        content: true,
        createdVia: true,
      },
    });
    check("createdVia = life_event", birthRow?.createdVia === CREATED_VIA_LIFE_EVENT);
    check("category = BIRTH", birthRow?.category === "BIRTH");
    check("year ↔ eventYear 미러링", birthRow?.year === birthRow?.eventYear);
    check("month ↔ eventMonth 미러링", birthRow?.month === birthRow?.eventMonth);
    check("title ↔ eventTitle 미러링", birthRow?.title === birthRow?.eventTitle);
    check("DB precision = EXACT", birthRow?.precision === "EXACT");

    // 3) KINDERGARTEN 저장 — year만 → APPROXIMATE
    console.log("\n[KINDERGARTEN 저장 (1970년, 월 모름)]");
    const childhood = await upsertLifeEvent(alice.id, "KINDERGARTEN", {
      title: "강원도 외할머니 댁",
      year: 1970,
      month: null,
      endYear: null,
      content: null,
    });
    check("precision = APPROXIMATE (year만)", childhood.precision === "APPROXIMATE");

    // 4) BIRTH 수정 — 같은 카테고리 update
    console.log("\n[BIRTH 수정]");
    const before = await prisma.userMemory.count({
      where: { userId: alice.id, createdVia: CREATED_VIA_LIFE_EVENT },
    });
    const birth2 = await upsertLifeEvent(alice.id, "BIRTH", {
      title: "서울 종로 (수정됨)",
      year: 1965,
      month: 4,
      endYear: null,
      content: "사실은 4월이었어요.",
    });
    const after = await prisma.userMemory.count({
      where: { userId: alice.id, createdVia: CREATED_VIA_LIFE_EVENT },
    });
    check("같은 id 로 update (새 행 X)", birth2.id === birth.id);
    check("life_event 행 수 변화 0", before === after);
    const birthAfter = await prisma.userMemory.findUnique({
      where: { id: birth.id },
      select: { title: true, eventMonth: true, precision: true, content: true },
    });
    check("수정된 title 반영", birthAfter?.title === "서울 종로 (수정됨)");
    check("month 갱신 4 → EXACT 유지", birthAfter?.eventMonth === 4);

    // 5) prefill 헬퍼 확인
    const fetched = await getLifeEventForCategory(alice.id, "BIRTH");
    check("getLifeEventForCategory prefill OK", fetched?.eventTitle === "서울 종로 (수정됨)");

    // 6) 답한 카테고리 집합
    const answered = await getAnsweredCategories(alice.id);
    check(
      "answered = {BIRTH, KINDERGARTEN}",
      answered.size === 2 && answered.has("BIRTH") && answered.has("KINDERGARTEN"),
    );

    // 7) 시간순 정렬
    const ordered = await getLifeEvents(alice.id);
    console.log("\n[getLifeEvents 결과]");
    for (const e of ordered) {
      console.log(
        `  ${e.eventYear}${e.eventMonth ? `.${String(e.eventMonth).padStart(2, "0")}` : "     "}  ${e.precision.padEnd(11)}  ${e.category}  ${e.title}`,
      );
    }
    check(
      "BIRTH(1965.4) < KINDERGARTEN(1970)",
      ordered[0]?.category === "BIRTH" && ordered[1]?.category === "KINDERGARTEN",
    );

    // 8) 가족 룸 호환 — bob 이 alice 의 life_event 도 봄
    const room = await prisma.sharedRoom.create({
      data: {
        name: "l2-room",
        ownerId: alice.id,
        members: {
          create: [
            { userId: alice.id, role: "owner", consentAt: new Date() },
            { userId: bob.id, role: "member", consentAt: new Date() },
          ],
        },
      },
      select: { id: true },
    });
    const roomView = await listRoomMemories(room.id, bob.id);
    const bobSeesBirth = roomView?.some(
      (m) => m.title === "서울 종로 (수정됨)",
    );
    const bobSeesChildhood = roomView?.some(
      (m) => m.title === "강원도 외할머니 댁",
    );
    check("가족 룸: bob 이 alice 의 BIRTH 봄", bobSeesBirth === true);
    check("가족 룸: bob 이 alice 의 KINDERGARTEN 봄", bobSeesChildhood === true);
  } finally {
    await prisma.user.delete({ where: { id: alice.id } });
    await prisma.user.delete({ where: { id: bob.id } });
  }

  console.log(
    failures.length === 0
      ? "\n전체 통과"
      : `\n실패 ${failures.length}건: ${failures.join(", ")}`,
  );
  if (failures.length > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
