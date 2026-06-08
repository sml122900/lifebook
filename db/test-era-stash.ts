// Phase E2 검증 — 시대 사건 클릭 담기 흐름.
//
// 1. stashEraEvent 가 UserMemory(createdVia=era_event) 한 행 생성
// 2. 같은 (userId, monthEventId) 두 번 호출 시 두 번째는 "already" (P2002)
// 3. 다른 사용자가 같은 monthEventId 담기 → 가능 (사용자별 독립)
// 4. unstashEraEvent 후 다시 담기 가능 (idempotent 사이클)
// 5. getStashedEraEventIds 결과 일관
// 6. getLifeEvents 가 era_event 도 가져오고 kind 필드 정확
// 7. era_event 는 인물 연결 거부 (lib/people.ts not_life_event 가드)
// 8. 가족 룸(listRoomMemories) 가 era_event 도 자동 노출 + content=null OK
//
// 실행: npx tsx db/test-era-stash.ts

import "dotenv/config";
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/db";
import { CREATED_VIA_LIFE_EVENT, getLifeEvents } from "../lib/life-events";
import {
  ERA_MEMORY_MAX_LENGTH,
  getStashedEraEventIds,
  getStashedEraMemories,
  saveEraMemory,
  stashEraEvent,
  unstashEraEvent,
} from "../lib/era-stash";
import { linkPersonToEvent } from "../lib/people";
import { listRoomMemories } from "../lib/rooms";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`  [✓] ${msg}`);
}

async function main() {
  const tag = `e2-${Date.now()}`;
  const alice = await prisma.user.create({
    data: { email: `${tag}-alice@test`, name: "alice" },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `${tag}-bob@test`, name: "bob" },
    select: { id: true },
  });

  // 테스트용 MonthEvent 한 행 — 시대 사건 흉내. 시드는 안 건드림.
  const me = await prisma.monthEvent.create({
    data: {
      id: `test-me-${randomUUID()}`,
      year: 2001,
      month: 9,
      section: "POLITICS_SOCIETY",
      title: "9·11 테러 (테스트)",
      description: "테스트 시드 — 실제 데이터 영향 0",
      confidence: "VERIFIED",
      source: "test-era-stash.ts",
    },
    select: { id: true, year: true, month: true, title: true },
  });

  // 룸 + 멤버 (가족 룸 노출 검증용)
  const room = await prisma.sharedRoom.create({
    data: {
      name: `${tag} room`,
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

  try {
    console.log("\n[1] 첫 담기 → stashed");
    const r1 = await stashEraEvent(alice.id, me.id);
    assert(r1 === "stashed", `첫 호출 = "stashed" (실제: ${r1})`);

    console.log("\n[2] 같은 사용자 두 번째 → already (P2002)");
    const r2 = await stashEraEvent(alice.id, me.id);
    assert(r2 === "already", `두 번째 호출 = "already" (실제: ${r2})`);

    console.log("\n[3] 다른 사용자 (bob) 도 같은 사건 담기 가능");
    const r3 = await stashEraEvent(bob.id, me.id);
    assert(r3 === "stashed", `bob 첫 호출 = "stashed" (실제: ${r3})`);

    console.log("\n[4] getStashedEraEventIds 일관성");
    const aliceStashed = await getStashedEraEventIds(alice.id);
    assert(aliceStashed.has(me.id), "alice 의 stashed 셋에 me.id 있음");
    assert(aliceStashed.size === 1, `alice 의 stashed 정확히 1개 (실제: ${aliceStashed.size})`);
    const bobStashed = await getStashedEraEventIds(bob.id);
    assert(bobStashed.has(me.id), "bob 의 stashed 셋에도 me.id 있음 (독립)");

    console.log("\n[5] UserMemory 행 자체 확인");
    const um = await prisma.userMemory.findFirst({
      where: { userId: alice.id, monthEventId: me.id, createdVia: "era_event" },
      select: {
        title: true, year: true, month: true,
        eventTitle: true, eventYear: true, eventMonth: true,
        precision: true, category: true, content: true,
      },
    });
    assert(um !== null, "alice 의 era_event UserMemory 행 존재");
    if (um) {
      assert(um.title === me.title, `title 미러링 OK (${um.title})`);
      assert(um.year === me.year, `year 미러링 OK (${um.year})`);
      assert(um.month === me.month, `month 미러링 OK (${um.month})`);
      assert(um.eventTitle === me.title, "eventTitle 미러링 OK");
      assert(um.eventYear === me.year, "eventYear 미러링 OK");
      assert(um.precision === "EXACT", `precision=EXACT (${um.precision})`);
      assert(um.category === null, "category=null (시대 사건은 개인 카테고리 X)");
      assert(um.content === null, "content=null (사용자 본인 회상 자리 비움)");
    }

    console.log("\n[6] getLifeEvents 가 era_event 도 가져오고 kind 필드 정확");
    const lifeEvents = await getLifeEvents(alice.id);
    const eraRows = lifeEvents.filter((e) => e.kind === "era_event");
    assert(eraRows.length === 1, `getLifeEvents 에 era_event 1개 (실제: ${eraRows.length})`);
    const era = eraRows[0];
    assert(era.title === me.title, "era_event LifeEvent title 정확");
    assert(era.eraDescription !== null, `eraDescription join OK (${era.eraDescription?.slice(0, 20)}…)`);
    assert(era.eraSection === "POLITICS_SOCIETY", "eraSection join OK");
    assert(era.eraSource === "test-era-stash.ts", "eraSource join OK");

    console.log("\n[7] era_event 는 인물 연결 거부");
    const person = await prisma.person.create({
      data: { userId: alice.id, name: "테스트 인물" },
      select: { id: true },
    });
    const memoryRow = await prisma.userMemory.findFirst({
      where: { userId: alice.id, monthEventId: me.id, createdVia: "era_event" },
      select: { id: true },
    });
    const linkResult = await linkPersonToEvent(
      alice.id,
      person.id,
      memoryRow!.id,
    );
    assert(linkResult === "not_life_event", `era_event 연결 = "not_life_event" (실제: ${linkResult})`);

    console.log("\n[8] 가족 룸 listRoomMemories 가 era_event 도 노출");
    const roomMems = await listRoomMemories(room.id, bob.id);
    assert(roomMems !== null, "bob 이 룸 멤버 (멤버십 검증 통과)");
    const aliceEra = roomMems!.find(
      (m) => m.userId === alice.id && m.title === me.title,
    );
    assert(aliceEra !== undefined, "bob 의 룸 뷰에서 alice 의 era_event 보임");
    if (aliceEra) {
      assert(aliceEra.content === null, "content=null 그대로 노출 (PersonalMemoryCard 가 null 시 안 그림)");
      assert(aliceEra.title === me.title, "title 정확");
    }

    console.log("\n[9] unstash 후 다시 stash 가능 (idempotent 사이클)");
    const u = await unstashEraEvent(alice.id, me.id);
    assert(u.removed === 1, `unstash removed=1 (실제: ${u.removed})`);
    const u2 = await unstashEraEvent(alice.id, me.id);
    assert(u2.removed === 0, `두 번째 unstash removed=0 (idempotent, 실제: ${u2.removed})`);
    const r4 = await stashEraEvent(alice.id, me.id);
    assert(r4 === "stashed", `재담기 = "stashed" (실제: ${r4})`);

    console.log("\n[10] life_event 흐름 회귀 — kind=life_event 정상");
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        createdVia: CREATED_VIA_LIFE_EVENT,
        year: 1985,
        month: 3,
        title: "대학교 입학",
        eventTitle: "대학교 입학",
        eventYear: 1985,
        eventMonth: 3,
        precision: "EXACT",
        category: "UNIVERSITY",
      },
    });
    const evs = await getLifeEvents(alice.id);
    const life = evs.filter((e) => e.kind === "life_event");
    assert(life.length === 1, `life_event 1개 (실제: ${life.length})`);
    assert(life[0].eraDescription === null, "life_event 의 eraDescription = null");
    assert(life[0].eraSection === null, "life_event 의 eraSection = null");
    assert(life[0].monthEventId === null, "life_event 의 monthEventId = null");

    console.log("\n[11] E3 — saveEraMemory 첫 회상 저장 → saved");
    const s1 = await saveEraMemory(alice.id, me.id, "그때 회사에서 뉴스 보고 충격받았어요");
    assert(s1 === "saved", `첫 저장 = "saved" (실제: ${s1})`);
    const m1 = await prisma.userMemory.findFirst({
      where: { userId: alice.id, monthEventId: me.id, createdVia: "era_event" },
      select: { content: true },
    });
    assert(
      m1?.content === "그때 회사에서 뉴스 보고 충격받았어요",
      `content DB 저장 OK (실제: ${m1?.content})`,
    );

    console.log("\n[12] E3 — 빈 입력 → cleared (null 로 비움)");
    const s2 = await saveEraMemory(alice.id, me.id, "   ");
    assert(s2 === "cleared", `빈 입력 = "cleared" (실제: ${s2})`);
    const m2 = await prisma.userMemory.findFirst({
      where: { userId: alice.id, monthEventId: me.id, createdVia: "era_event" },
      select: { content: true },
    });
    assert(m2?.content === null, `content=null 로 정규화 (실제: ${m2?.content})`);

    console.log("\n[13] E3 — 안 담은 사건엔 not_stashed (다른 monthEventId)");
    const otherMe = await prisma.monthEvent.create({
      data: {
        id: `test-me-other-${randomUUID()}`,
        year: 2002,
        section: "POLITICS_SOCIETY",
        title: "테스트 미담은 사건",
        confidence: "VERIFIED",
        source: "test-era-stash.ts",
      },
      select: { id: true },
    });
    try {
      const s3 = await saveEraMemory(alice.id, otherMe.id, "회상");
      assert(s3 === "not_stashed", `미담은 사건 = "not_stashed" (실제: ${s3})`);
    } finally {
      await prisma.monthEvent.delete({ where: { id: otherMe.id } });
    }

    console.log("\n[14] E3 — 길이 초과 → too_long");
    const longText = "가".repeat(ERA_MEMORY_MAX_LENGTH + 1);
    const s4 = await saveEraMemory(alice.id, me.id, longText);
    assert(s4 === "too_long", `${ERA_MEMORY_MAX_LENGTH + 1}자 = "too_long" (실제: ${s4})`);
    const m4 = await prisma.userMemory.findFirst({
      where: { userId: alice.id, monthEventId: me.id, createdVia: "era_event" },
      select: { content: true },
    });
    assert(m4?.content === null, "길이 초과 시 DB 변경 없음 (직전 cleared 유지)");

    console.log("\n[15] E3 — getStashedEraMemories: content 동시 prefetch");
    // 저장 후 다시
    await saveEraMemory(alice.id, me.id, "재저장된 회상");
    const memMap = await getStashedEraMemories(alice.id);
    assert(memMap.has(me.id), "memMap 에 me.id 키 존재");
    assert(
      memMap.get(me.id) === "재저장된 회상",
      `content prefetch OK (실제: ${memMap.get(me.id)})`,
    );

    console.log("\n[16] E3 — 가족 룸에 content 자동 노출 (PersonalMemoryCard 분기 X)");
    const roomMems2 = await listRoomMemories(room.id, bob.id);
    const aliceEra2 = roomMems2!.find(
      (m) => m.userId === alice.id && m.title === me.title,
    );
    assert(aliceEra2 !== undefined, "alice 의 era_event 가 여전히 룸에 보임");
    if (aliceEra2) {
      assert(
        aliceEra2.content === "재저장된 회상",
        `룸 뷰에서 alice 의 회상 노출 OK (실제: ${aliceEra2.content})`,
      );
    }

    console.log("\n[17] E3 — getLifeEvents 가 monthEventId 채움 (EraCard 의 저장 키)");
    const evs2 = await getLifeEvents(alice.id);
    const era2 = evs2.find((e) => e.kind === "era_event");
    assert(era2 !== undefined, "alice 에 era_event 1개");
    if (era2) {
      assert(era2.monthEventId === me.id, `monthEventId 매핑 OK (실제: ${era2.monthEventId})`);
      assert(era2.content === "재저장된 회상", "content 매핑 OK");
    }

    console.log("\n전체 통과");
  } finally {
    // cleanup
    await prisma.personEvent.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.person.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.userMemory.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.roomMember.deleteMany({ where: { roomId: room.id } });
    await prisma.sharedRoom.delete({ where: { id: room.id } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await prisma.monthEvent.delete({ where: { id: me.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
