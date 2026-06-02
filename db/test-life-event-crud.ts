// Phase L4 검증 — 인생 이벤트 추가/수정/삭제 헬퍼가 정책대로 동작.
//
// 시나리오:
//   1. createLifeEvent — 카테고리당 여러 행 허용 (L2 는 1행 upsert, L4 는 N행 create)
//   2. precision 다운그레이드 — EXACT 인데 month=null 이면 자동 APPROXIMATE
//   3. forcePrecision=APPROXIMATE — 앵커 사이 모드 (month=null 이라 자연스레 APPROXIMATE)
//   4. updateLifeEvent — 권한 + 부분 수정
//   5. updateLifeEvent — 다른 사용자 행은 못 건드림 (count=0 → null 리턴)
//   6. deleteLifeEvent — 자기 행만 삭제됨, 다른 사용자 행은 안전
//   7. getLifeEventById — userId 일치 안 하면 null
//   8. 정렬(getLifeEvents) — 사이 이벤트와 앵커가 시간순으로 잘 섞임
//
// 실행: npx tsx db/test-life-event-crud.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  CREATED_VIA_LIFE_EVENT,
  createLifeEvent,
  deleteLifeEvent,
  getLifeEventById,
  getLifeEvents,
  updateLifeEvent,
  upsertLifeEvent,
} from "../lib/life-events";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `l4-alice-${Date.now()}@test`, name: "alice" },
    select: { id: true },
  });
  const eve = await prisma.user.create({
    data: { email: `l4-eve-${Date.now()}@test`, name: "eve" },
    select: { id: true },
  });

  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
    if (!ok) failures.push(label);
  };

  try {
    // L2 가 만들어 두는 골격: SCHOOL 1행 (upsert).
    await upsertLifeEvent(alice.id, "SCHOOL", {
      title: "OO초등학교",
      year: 1972,
      month: 3,
      content: null,
    });

    // 1) createLifeEvent — 같은 SCHOOL 카테고리에 1행 더 (L4 는 여러 행 허용)
    console.log("\n[L4: 같은 카테고리에 여러 행 허용]");
    const second = await createLifeEvent(alice.id, "SCHOOL", {
      title: "OO중학교",
      year: 1978,
      month: 3,
      content: null,
    });
    check("두 번째 SCHOOL 행 정상 create", typeof second.id === "string");
    const schoolRows = await prisma.userMemory.count({
      where: {
        userId: alice.id,
        createdVia: CREATED_VIA_LIFE_EVENT,
        category: "SCHOOL",
      },
    });
    check("SCHOOL 카테고리에 2행 (L2 upsert 1 + L4 create 1)", schoolRows === 2);

    // 2) precision 다운그레이드 — EXACT 인데 month=null
    console.log("\n[precision 다운그레이드]");
    const downgraded = await createLifeEvent(
      alice.id,
      "OTHER",
      { title: "추정 사건", year: 1980, month: null, content: null },
      "EXACT", // 강제 EXACT 인데 month 없음 → 자동 APPROXIMATE
    );
    check(
      "EXACT + month=null → APPROXIMATE 다운그레이드",
      downgraded.precision === "APPROXIMATE",
    );

    // 3) forcePrecision=APPROXIMATE — "앵커 사이" 모드 케이스
    const between = await createLifeEvent(
      alice.id,
      "OTHER",
      { title: "사이 이벤트", year: 1975, month: null, content: null },
      "APPROXIMATE",
    );
    check(
      "forcePrecision=APPROXIMATE 유지",
      between.precision === "APPROXIMATE",
    );

    // 4) updateLifeEvent — 본인 행 수정
    console.log("\n[updateLifeEvent]");
    const updated = await updateLifeEvent(
      alice.id,
      between.id,
      "OTHER",
      { title: "사이 이벤트 (수정)", year: 1976, month: null, content: "조금 더 명확해진 기억" },
    );
    check("본인 행 수정 성공", updated !== null && updated.id === between.id);

    const row = await prisma.userMemory.findUnique({
      where: { id: between.id },
      select: { title: true, eventYear: true, content: true },
    });
    check("수정 반영 (title/year/content)", row?.title === "사이 이벤트 (수정)" && row?.eventYear === 1976 && row?.content === "조금 더 명확해진 기억");

    // 5) 다른 사용자가 수정 시도 → null
    const evilUpdate = await updateLifeEvent(
      eve.id,
      between.id,
      "OTHER",
      { title: "악의적 수정", year: 1900, month: null, content: null },
    );
    check("다른 사용자 수정 차단 (null 리턴)", evilUpdate === null);

    const stillSame = await prisma.userMemory.findUnique({
      where: { id: between.id },
      select: { title: true, eventYear: true },
    });
    check(
      "악의적 수정 시도해도 데이터 무변경",
      stillSame?.title === "사이 이벤트 (수정)" && stillSame?.eventYear === 1976,
    );

    // 6) getLifeEventById — userId 검증
    const own = await getLifeEventById(alice.id, between.id);
    check("본인 단일 조회 OK", own?.id === between.id);
    const cross = await getLifeEventById(eve.id, between.id);
    check("다른 사용자 단일 조회 → null", cross === null);

    // 7) deleteLifeEvent — 다른 사용자가 삭제 시도 → false
    console.log("\n[deleteLifeEvent]");
    const evilDel = await deleteLifeEvent(eve.id, between.id);
    check("다른 사용자 삭제 차단 (false)", evilDel === false);
    const stillExists = await prisma.userMemory.findUnique({
      where: { id: between.id },
    });
    check("악의적 삭제 시도해도 행 살아있음", stillExists !== null);

    // 본인 삭제
    const okDel = await deleteLifeEvent(alice.id, between.id);
    check("본인 삭제 OK", okDel === true);
    const gone = await prisma.userMemory.findUnique({
      where: { id: between.id },
    });
    check("실제로 행 삭제됨", gone === null);

    // 두 번째 삭제 시도 (이미 없음) → false, 에러 X
    const reDel = await deleteLifeEvent(alice.id, between.id);
    check("이미 삭제된 행 재삭제 → false (에러 없음)", reDel === false);

    // 8) life_event 가 아닌 행은 삭제·수정·조회 모두 거부
    console.log("\n[life_event 가 아닌 행 보호]");
    const aiChat = await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 2025,
        title: "ai_chat 행",
        createdVia: "ai_chat",
      },
      select: { id: true },
    });
    const updateAiChat = await updateLifeEvent(
      alice.id,
      aiChat.id,
      "OTHER",
      { title: "강제 변경", year: 2000, month: null, content: null },
    );
    check("ai_chat 행은 update 거부 (null)", updateAiChat === null);

    const delAiChat = await deleteLifeEvent(alice.id, aiChat.id);
    check("ai_chat 행은 delete 거부 (false)", delAiChat === false);
    const aiChatStill = await prisma.userMemory.findUnique({
      where: { id: aiChat.id },
    });
    check("ai_chat 행 실제 보존", aiChatStill !== null);

    // 9) 정렬 — getLifeEvents 가 사이/앵커 섞어 시간순
    console.log("\n[정렬 — 사이 + 앵커 섞임]");
    const ordered = await getLifeEvents(alice.id);
    for (const e of ordered) {
      console.log(
        `  ${e.eventYear}${e.eventMonth ? `.${String(e.eventMonth).padStart(2, "0")}` : "     "}  ${e.precision.padEnd(11)}  ${e.category}  ${e.title}`,
      );
    }
    check(
      "초등(1972.3) < 중학(1978.3) < 추정사건(1980)",
      ordered.length === 3 &&
        ordered[0].eventYear === 1972 &&
        ordered[1].eventYear === 1978 &&
        ordered[2].eventYear === 1980,
    );
  } finally {
    await prisma.user.delete({ where: { id: alice.id } });
    await prisma.user.delete({ where: { id: eve.id } });
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
