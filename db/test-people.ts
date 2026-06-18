// Phase P1 검증 — 인물(Person) + PersonEvent 헬퍼가 정책대로 동작.
//
// 시나리오:
//   (a) Person CRUD + userId 권한 (남의 인물 수정/삭제 차단)
//   (b) PersonEvent 생성·중복 idempotent·삭제
//   (c) life_event 아닌 memoryId(예: ai_chat)에 연결 시도 → 거부
//   (d) Person 삭제 시 PersonEvent cascade
//   (e) listPeopleByEvent / listEventsByPerson — 정렬·정확도·권한
//
// 실행: npx tsx db/test-people.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  createLifeEvent,
  upsertLifeEvent,
} from "../lib/life-events";
import {
  createPerson,
  deletePerson,
  getPerson,
  linkPersonToEvent,
  listEventsByPerson,
  listPeople,
  listPeopleByEvent,
  unlinkPersonFromEvent,
  updatePerson,
} from "../lib/people";

async function main() {
  const ts = Date.now();
  const alice = await prisma.user.create({
    data: { email: `p1-alice-${ts}@test`, name: "alice" },
    select: { id: true },
  });
  const eve = await prisma.user.create({
    data: { email: `p1-eve-${ts}@test`, name: "eve" },
    select: { id: true },
  });

  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
    if (!ok) failures.push(label);
  };

  try {
    // ── (a) Person CRUD + 권한 ────────────────────────────────────
    console.log("\n[a) Person CRUD + 권한]");

    const kim = await createPerson(alice.id, {
      subjectType: "person",
      name: "김초친",
      relation: "초등 친구",
      birthYear: null,
      category: null,
      metYear: 1972,
      memo: "체육 잘함",
    });
    check("createPerson — id/이름 채워짐", typeof kim.id === "string" && kim.name === "김초친");

    const lee = await createPerson(alice.id, {
      subjectType: "person",
      name: "이중친",
      relation: null,
      birthYear: null,
      category: null,
      metYear: null,
      memo: null,
    });
    check("nullable 필드 (relation/metYear/memo) 모두 null 허용", typeof lee.id === "string");

    // 입력 검증 — 빈 이름
    let threw = false;
    try {
      await createPerson(alice.id, {
      subjectType: "person", name: "   ", relation: null, birthYear: null, category: null, metYear: null, memo: null });
    } catch {
      threw = true;
    }
    check("빈 이름 거부 (throw)", threw);

    // 입력 검증 — 50자 초과
    threw = false;
    try {
      await createPerson(alice.id, {
      subjectType: "person",
        name: "x".repeat(51),
        relation: null,
        birthYear: null,
        category: null,
        metYear: null,
        memo: null,
      });
    } catch {
      threw = true;
    }
    check("이름 51자 거부", threw);

    // 입력 검증 — metYear 범위
    threw = false;
    try {
      await createPerson(alice.id, {
      subjectType: "person",
        name: "범위벗",
        relation: null,
        birthYear: null,
        category: null,
        metYear: 1800,
        memo: null,
      });
    } catch {
      threw = true;
    }
    check("metYear 1800 거부", threw);

    // listPeople — alice 만 보임 (eve 의 인물 안 섞임)
    await createPerson(eve.id, {
      subjectType: "person", name: "남의친구", relation: null, birthYear: null, category: null, metYear: null, memo: null });
    const alicePeople = await listPeople(alice.id);
    check("listPeople — alice 본인 인물만", alicePeople.length === 2);
    check(
      "listPeople — name ASC 정렬 (김초친 < 이중친)",
      alicePeople[0].name === "김초친" && alicePeople[1].name === "이중친",
    );

    // getPerson — 권한
    const got = await getPerson(alice.id, kim.id);
    check("getPerson 본인 OK", got?.id === kim.id);
    const crossGet = await getPerson(eve.id, kim.id);
    check("getPerson 남의 행 → null", crossGet === null);

    // updatePerson — 본인 OK
    const upd = await updatePerson(alice.id, kim.id, {
      subjectType: "person",
      name: "김초친(수정)",
      relation: "초등 단짝",
      birthYear: null,
      category: null,
      metYear: 1973,
      memo: "체육·노래 잘함",
    });
    check("updatePerson 본인 OK", upd?.name === "김초친(수정)" && upd?.metYear === 1973);

    // updatePerson — 남의 행 → null
    const crossUpd = await updatePerson(eve.id, kim.id, {
      subjectType: "person",
      name: "악의수정",
      relation: null,
      birthYear: null,
      category: null,
      metYear: null,
      memo: null,
    });
    check("updatePerson 남의 행 → null", crossUpd === null);
    const stillKim = await getPerson(alice.id, kim.id);
    check("악의 수정 후에도 데이터 보존", stillKim?.name === "김초친(수정)");

    // deletePerson — 남의 행 → false
    const crossDel = await deletePerson(eve.id, kim.id);
    check("deletePerson 남의 행 → false", crossDel === false);
    const stillExists = await getPerson(alice.id, kim.id);
    check("악의 삭제 후에도 행 살아있음", stillExists !== null);

    // ── (b)(c) PersonEvent ────────────────────────────────────────
    console.log("\n[b/c) PersonEvent — life_event 만, idempotent]");

    // life_event 두 행 만들기
    await upsertLifeEvent(alice.id, "ELEMENTARY", {
      title: "OO초등학교",
      year: 1972,
      month: 3,
      endYear: 1978,
      content: null,
    });
    const elemRow = await prisma.userMemory.findFirstOrThrow({
      where: { userId: alice.id, category: "ELEMENTARY" },
      select: { id: true },
    });
    const trip = await createLifeEvent(alice.id, "FAMILY", {
      title: "친구들과 첫 수학여행",
      year: 1975,
      month: 5,
      endYear: null,
      content: null,
    });

    // 정상 링크
    const r1 = await linkPersonToEvent(alice.id, kim.id, elemRow.id);
    check("link 신규 → linked", r1 === "linked");

    // 중복 링크 → idempotent
    const r2 = await linkPersonToEvent(alice.id, kim.id, elemRow.id);
    check("link 중복 → already (P2002 무시)", r2 === "already");

    // 두 번째 이벤트에 같은 인물
    const r3 = await linkPersonToEvent(alice.id, kim.id, trip.id);
    check("link 같은 인물 다른 이벤트 OK", r3 === "linked");

    // 다른 인물도 같은 이벤트에 OK
    const r4 = await linkPersonToEvent(alice.id, lee.id, trip.id);
    check("link 다른 인물 같은 이벤트 OK", r4 === "linked");

    // ai_chat 메모리에 링크 시도 → 거부
    const aiChat = await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 2025,
        title: "ai_chat 행",
        createdVia: "ai_chat",
      },
      select: { id: true },
    });
    const rChat = await linkPersonToEvent(alice.id, kim.id, aiChat.id);
    check("ai_chat 메모리 링크 → not_linkable", rChat === "not_linkable");
    const chatPersonEvents = await prisma.personEvent.count({
      where: { memoryId: aiChat.id },
    });
    check("ai_chat 에 PersonEvent 행 안 생김", chatPersonEvents === 0);

    // B — photo 메모리에 인물 연결 허용 (life_event + photo). 전용 인물
    // (photoPal)로 — kim 의 하류 카운트 검증에 영향 안 주게.
    const photoPal = await createPerson(alice.id, {
      subjectType: "person",
      name: "사진친구",
      relation: null,
      birthYear: null,
      category: null,
      metYear: null,
      memo: null,
    });
    const photoMem = await prisma.userMemory.create({
      data: {
        userId: alice.id,
        createdVia: "photo",
        year: 2012,
        month: 5,
        title: "2012년 5월 사진",
        content: "가족 나들이",
        eventYear: 2012,
        eventMonth: 5,
      },
      select: { id: true },
    });
    const rPhoto = await linkPersonToEvent(alice.id, photoPal.id, photoMem.id);
    check("photo 메모리 링크 → linked", rPhoto === "linked");
    const photoEvents = await listEventsByPerson(alice.id, photoPal.id);
    const photoRow = photoEvents.find((e) => e.id === photoMem.id);
    check("listEventsByPerson 에 photo 포함", !!photoRow);
    check("photo row kind=photo", photoRow?.kind === "photo");

    // 다른 사용자 인물 → not_found
    const evePerson = await prisma.person.findFirstOrThrow({
      where: { userId: eve.id },
      select: { id: true },
    });
    const rCross = await linkPersonToEvent(alice.id, evePerson.id, elemRow.id);
    check("alice 가 eve 의 인물 링크 시도 → not_found", rCross === "not_found");

    // 다른 사용자 이벤트 → not_found
    const eveLife = await upsertLifeEvent(eve.id, "ELEMENTARY", {
      title: "eve 초등",
      year: 1980,
      month: 3,
      endYear: null,
      content: null,
    });
    const rCross2 = await linkPersonToEvent(alice.id, kim.id, eveLife.id);
    check("alice 가 eve 의 이벤트 링크 시도 → not_found", rCross2 === "not_found");

    // unlink — 정상
    const u1 = await unlinkPersonFromEvent(alice.id, lee.id, trip.id);
    check("unlink 정상 → true", u1 === true);
    const u2 = await unlinkPersonFromEvent(alice.id, lee.id, trip.id);
    check("unlink 이미 없음 → false", u2 === false);

    // unlink — 남의 권한 (다시 link 후 eve 가 unlink 시도)
    await linkPersonToEvent(alice.id, lee.id, trip.id);
    const uCross = await unlinkPersonFromEvent(eve.id, lee.id, trip.id);
    check("eve 가 alice 의 link unlink 시도 → false", uCross === false);
    const stillLinked = await prisma.personEvent.count({
      where: { personId: lee.id, memoryId: trip.id },
    });
    check("남이 unlink 시도해도 링크 보존", stillLinked === 1);

    // ── (d) Person 삭제 → PersonEvent cascade ─────────────────────
    console.log("\n[d) Person 삭제 → cascade]");
    const beforeCascade = await prisma.personEvent.count({
      where: { personId: kim.id },
    });
    check("kim 의 PersonEvent 2건 (elem + trip)", beforeCascade === 2);

    const okDelPerson = await deletePerson(alice.id, kim.id);
    check("Person 본인 삭제 OK", okDelPerson === true);
    const afterCascade = await prisma.personEvent.count({
      where: { personId: kim.id },
    });
    check("cascade 로 PersonEvent 모두 삭제", afterCascade === 0);

    // 메모리 자체는 살아있어야 함
    const elemStill = await prisma.userMemory.findUnique({
      where: { id: elemRow.id },
    });
    check("Person 삭제해도 연결된 UserMemory 보존", elemStill !== null);

    // ── (e) listPeopleByEvent / listEventsByPerson ────────────────
    console.log("\n[e) list — 정렬·정확도·권한]");

    // 새 인물 두 명 + trip 에 둘 다 링크
    const park = await createPerson(alice.id, {
      subjectType: "person",
      name: "박동기",
      relation: "동기",
      birthYear: null,
      category: null,
      metYear: 1990,
      memo: null,
    });
    const choi = await createPerson(alice.id, {
      subjectType: "person",
      name: "최선배",
      relation: "선배",
      birthYear: null,
      category: null,
      metYear: 1989,
      memo: null,
    });
    await linkPersonToEvent(alice.id, park.id, trip.id);
    await linkPersonToEvent(alice.id, choi.id, trip.id);
    // lee 도 trip 에 이미 다시 link 돼있음 (위에서 stillLinked 검증용)

    const peopleAtTrip = await listPeopleByEvent(alice.id, trip.id);
    check("listPeopleByEvent — 3명 (이중친/박동기/최선배)", peopleAtTrip.length === 3);
    check(
      "listPeopleByEvent — name ko 정렬 (박동기 < 이중친 < 최선배)",
      peopleAtTrip[0].name === "박동기" &&
        peopleAtTrip[1].name === "이중친" &&
        peopleAtTrip[2].name === "최선배",
    );

    // 남의 사용자가 같은 memoryId 로 호출 → 빈 배열 (PersonEvent.userId 필터)
    const crossPeople = await listPeopleByEvent(eve.id, trip.id);
    check("남이 listPeopleByEvent → []", crossPeople.length === 0);

    // listEventsByPerson — park 은 trip 1건만
    const parkEvents = await listEventsByPerson(alice.id, park.id);
    check("listEventsByPerson(park) — 1건", parkEvents.length === 1);
    check("listEventsByPerson(park) — 그 1건이 trip", parkEvents[0].id === trip.id);

    // 추가 이벤트 더 만들어 정렬 확인 (이중친 lee 에)
    const ev1985 = await createLifeEvent(alice.id, "WORK", {
      title: "첫 직장 동기 모임",
      year: 1985,
      month: 6,
      endYear: null,
      content: null,
    });
    const ev1985Sept = await createLifeEvent(alice.id, "FAMILY", {
      title: "1985년쯤 일",
      year: 1985,
      month: null, // 사이 이벤트
      endYear: null,
      content: null,
    });
    await linkPersonToEvent(alice.id, lee.id, ev1985.id);
    await linkPersonToEvent(alice.id, lee.id, ev1985Sept.id);

    const leeEvents = await listEventsByPerson(alice.id, lee.id);
    check(
      "listEventsByPerson(lee) — 3건 (trip 1975.5 < ev1985.6 < ev1985 사이)",
      leeEvents.length === 3,
    );
    check(
      "정렬 — eventYear ASC, month ASC NULLS LAST",
      leeEvents[0].eventYear === 1975 &&
        leeEvents[1].eventYear === 1985 &&
        leeEvents[1].eventMonth === 6 &&
        leeEvents[2].eventYear === 1985 &&
        leeEvents[2].eventMonth === null,
    );

    // 남이 listEventsByPerson 호출 → 빈 배열 (인물 권한 체크)
    const crossEvents = await listEventsByPerson(eve.id, lee.id);
    check("남이 listEventsByPerson → []", crossEvents.length === 0);

    // UserMemory cascade 도 확인 — trip 삭제 시 PersonEvent 사라짐
    const beforeMemDel = await prisma.personEvent.count({
      where: { memoryId: trip.id },
    });
    check("trip 의 PersonEvent 3건", beforeMemDel === 3);
    await prisma.userMemory.delete({ where: { id: trip.id } });
    const afterMemDel = await prisma.personEvent.count({
      where: { memoryId: trip.id },
    });
    check("UserMemory 삭제 → PersonEvent cascade", afterMemDel === 0);
  } finally {
    // 정리 — User cascade 가 Person/PersonEvent/UserMemory 모두 정리.
    await prisma.user.delete({ where: { id: alice.id } });
    await prisma.user.delete({ where: { id: eve.id } });
  }

  console.log(
    failures.length === 0
      ? "\n전체 통과"
      : `\n실패 ${failures.length}건:\n  - ${failures.join("\n  - ")}`,
  );
  if (failures.length > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
