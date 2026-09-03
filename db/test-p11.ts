// v3 P11 검증. 실행: npx tsx db/test-p11.ts
//
// P11-2 — buildPersonAddress 가 사회적 윗사람(선임·"~님" 토큰)에 격식 조사.
// P11-3 — lib/people.ts 가 v2 PersonEvent + v3 PersonLifeEvent 를 합산/합쳐
//         돌려주고(count·listEventsByPerson·listPeopleByEvent), v3 링크도
//         unlinkPersonFromEvent 로 풀린다. v2 동작은 test-people 39건이 회귀.
// P11-4 — getPeriodPromptForEvent 가 MARRIAGE 2회차 문구를 낸다(BIRTH 는
//         test-p10-period-reentry 가 커버).
// P11-1 은 실 Sonnet 호출이라 여기 없음 — db/_p11-probe 로 3회×5케이스 실측.
//
// 데이터는 마지막에 deleteAccountTx 로 흔적 삭제.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { buildPersonAddress } from "../lib/person-honorific";
import { createEpisodeBridge } from "../lib/episode";
import { getPeriodPromptForEvent } from "../lib/gap-detector";
import { createLifeEvent } from "../lib/life-events";
import {
  countEventsPerPerson,
  createPerson,
  linkPersonToEvent,
  listEventsByPerson,
  listPeopleByEvent,
  unlinkPersonFromEvent,
} from "../lib/people";
import { linkPersonToLifeEvent } from "../lib/person-life-event";

let failed = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "OK" : "FAIL"} ${label}`);
  if (!cond) failed++;
}

async function main() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "p11-test-" } } });

  // ── P11-2 호칭 (순수) ──────────────────────────────────────────────
  check("선임 → 격식 조사", buildPersonAddress("정영식", "선임") === "정영식 선임과");
  // "담임 선생님" 은 "~님" 토큰(선생님)만 호칭으로 — "박정호 담임 선생님과" 보다 자연스럽다.
  check("담임 선생님 → 격식 조사", buildPersonAddress("박정호", "담임 선생님") === "박정호 선생님과");
  check("목록 밖 '~님' 토큰(목사님)", buildPersonAddress("이철수", "동네 목사님") === "이철수 목사님과");
  check("사장 → 격식 조사", buildPersonAddress("김영희", "사장") === "김영희 사장과");
  check("친구 → 반말 조사 유지", buildPersonAddress("최영수", "친구") === "최영수랑");
  check("할머니(가족) 회귀", buildPersonAddress("김순임", "할머니") === "김순임 할머니와");
  check("이름 없이 호칭만(name=relation)", buildPersonAddress("선임", "선임") === "선임과");

  // ── 픽스처 ───────────────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: { email: "p11-test-alice@test", name: "alice" },
  });
  const uid = user.id;

  // v2 UserMemory(life_event) + v3 LifeEvent 하나씩.
  const v2Event = await createLifeEvent(uid, "WORK", {
    title: "첫 직장 입사",
    year: 1985,
    month: 3,
    endYear: null,
    content: null,
  });
  const v3Military = await prisma.lifeEvent.create({
    data: { userId: uid, type: "MILITARY", label: "군 입대", year: 1980, status: "CONFIRMED", sequenceOrder: 0 },
  });
  const v3Marriage = await prisma.lifeEvent.create({
    data: { userId: uid, type: "MARRIAGE", label: "결혼", year: 1985, correctedYear: 1986, status: "CORRECTED", sequenceOrder: 1 },
  });
  const v3NoYear = await prisma.lifeEvent.create({
    data: { userId: uid, type: "FIRST_JOB", label: "첫 직장", year: null, status: "CONFIRMED", sequenceOrder: 2 },
  });

  const senior = await createPerson(uid, {
    subjectType: "person", name: "정영식", relation: "선임", birthYear: null, category: null, metYear: 1980, memo: null,
  });
  const friend = await createPerson(uid, {
    subjectType: "person", name: "최영수", relation: "친구", birthYear: null, category: null, metYear: null, memo: null,
  });

  // senior: v3 링크 2건(군대·결혼) + 연도 없는 v3 1건 / friend: v2 1건 + v3 1건.
  await linkPersonToLifeEvent(uid, senior.id, v3Military.id);
  await linkPersonToLifeEvent(uid, senior.id, v3Marriage.id);
  await linkPersonToLifeEvent(uid, senior.id, v3NoYear.id);
  check("v2 링크 linked", (await linkPersonToEvent(uid, friend.id, v2Event.id)) === "linked");
  await linkPersonToLifeEvent(uid, friend.id, v3Military.id);

  // senior 와의 Episode(군대) — listEventsByPerson content 로 나와야 함.
  await createEpisodeBridge(uid, v3Military.id, "군 입대", 1980, "정영식 선임이 야간 보초를 챙겨주셨다.", "[본인] …", senior.id);

  // ── P11-3 count ───────────────────────────────────────────────────
  const counts = await countEventsPerPerson(uid);
  check("count(senior) = v3 3건", counts.get(senior.id) === 3);
  check("count(friend) = v2 1 + v3 1 = 2", counts.get(friend.id) === 2);

  // ── P11-3 listEventsByPerson ───────────────────────────────────────
  const seniorEvents = await listEventsByPerson(uid, senior.id);
  check("senior 이벤트 2건 (연도 없는 v3 는 카드 제외)", seniorEvents.length === 2);
  check(
    "정렬: 1980 군 입대 → 1986(정정 연도) 결혼",
    seniorEvents[0]?.id === v3Military.id && seniorEvents[1]?.id === v3Marriage.id && seniorEvents[1]?.eventYear === 1986,
  );
  check("v3 행 title=라벨", seniorEvents[0]?.title === "군 입대");
  check("v3 행 content=그 인물과의 Episode", seniorEvents[0]?.content === "정영식 선임이 야간 보초를 챙겨주셨다.");
  check("v3 행 kind=life_event·places/photos 빈 배열", seniorEvents[0]?.kind === "life_event" && seniorEvents[0]?.places.length === 0 && seniorEvents[0]?.photos.length === 0);

  const friendEvents = await listEventsByPerson(uid, friend.id);
  check(
    "friend: v3(1980) → v2(1985.03) 시간순 합침",
    friendEvents.length === 2 && friendEvents[0]?.id === v3Military.id && friendEvents[1]?.id === v2Event.id,
  );
  check("friend 의 v3 행 content 는 null(그 인물 Episode 없음)", friendEvents[0]?.content === null);

  // ── P11-3 listPeopleByEvent ────────────────────────────────────────
  const atMilitary = await listPeopleByEvent(uid, v3Military.id);
  check("listPeopleByEvent(v3 id) 2명 (ko 정렬: 정영식 < 최영수)", atMilitary.map((p) => p.name).join(",") === "정영식,최영수");
  const atV2 = await listPeopleByEvent(uid, v2Event.id);
  check("listPeopleByEvent(v2 id) 1명 회귀", atV2.length === 1 && atV2[0].id === friend.id);

  // 권한 경계 — 남의 userId 로는 빈 결과.
  const other = await prisma.user.create({ data: { email: "p11-test-bob@test", name: "bob" } });
  check("남의 userId count 빈 맵", (await countEventsPerPerson(other.id)).size === 0);
  check("남의 userId listPeopleByEvent(v3) []", (await listPeopleByEvent(other.id, v3Military.id)).length === 0);

  // ── P11-3 unlink (v3) ─────────────────────────────────────────────
  check("남이 v3 unlink → false", (await unlinkPersonFromEvent(other.id, senior.id, v3Military.id)) === false);
  check("본인 v3 unlink → true", (await unlinkPersonFromEvent(uid, senior.id, v3Military.id)) === true);
  check("v3 unlink 두 번째 → false", (await unlinkPersonFromEvent(uid, senior.id, v3Military.id)) === false);
  check("unlink 후 count(senior)=2", (await countEventsPerPerson(uid)).get(senior.id) === 2);
  check("unlink 해도 Episode 본문 보존", (await prisma.episode.count({ where: { personId: senior.id } })) === 1);
  check("v2 unlink 회귀 → true", (await unlinkPersonFromEvent(uid, friend.id, v2Event.id)) === true);

  // ── P11-4 period 2회차 문구 (MARRIAGE) ─────────────────────────────
  const first = await getPeriodPromptForEvent(uid, v3Marriage.id);
  check(
    "1회차: 결혼 문구",
    first?.announceText === "결혼 이후 이야기도 해볼게요" && first?.userPrompt === "결혼하시고 나서는 어떻게 지내셨어요?",
  );
  await createEpisodeBridge(uid, v3Marriage.id, "결혼 이후", 1986, "분당으로 이사했다.", "[본인] …", undefined, true);
  const second = await getPeriodPromptForEvent(uid, v3Marriage.id);
  check(
    "2회차: 다른 문구",
    second?.announceText === "결혼 이후 이야기 더 해볼게요" && second?.userPrompt === "결혼하시고 나서 이야기, 더 들려주실 게 있으세요?",
  );
  // 이벤트-자체 Episode(isPeriod=false)만 있는 앵커는 여전히 1회차 문구.
  await createEpisodeBridge(uid, v3Military.id, "군 입대", 1980, "훈련소 이야기.", "[본인] …");
  const militaryPrompt = await getPeriodPromptForEvent(uid, v3Military.id);
  check("period 아닌 Episode 만 있으면 1회차 문구 유지", militaryPrompt?.announceText === "군 입대 이후 이야기도 해볼게요");

  // ── 흔적 삭제 ──────────────────────────────────────────────────────
  await deleteAccountTx(uid);
  await deleteAccountTx(other.id);
  check("탈퇴 후 Person 고아 0", (await prisma.person.count({ where: { userId: uid } })) === 0);
  check("탈퇴 후 PersonLifeEvent 고아 0", (await prisma.personLifeEvent.count({ where: { userId: uid } })) === 0);

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
