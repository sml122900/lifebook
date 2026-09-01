// v3 P6 — 인물 모드 실검증. 실행: npx tsx db/test-person-mode.ts
//
// 실제 함수를 그대로 호출한다(재현 아님) — submitPersonAnswer/
// getPersonEpisodeTarget(lib/person-chat.ts), createEpisodeBridge
// (lib/episode.ts), detectGaps(lib/gap-detector.ts), deletePerson/
// deleteAccountTx, getConfirmedLifeEvent/listConfirmedLifeEvents
// (lib/life-event-query.ts). Sonnet 인물 추출 API 를 실제로 3회 호출(수락/
// 거절/CORRECTED 시나리오 각 1회).
//
// 커버 시나리오:
// 1) "기억 안 나요" 류 답변 → 저장 0건, 캐묻지 않고 통과.
// 2) 실제 답변에서 이름+관계 추출 → Person(isDraft=false) + PersonLifeEvent 생성.
// 3) 갭 전이: person 갭(이벤트) → 사라짐, person_episode 갭(인물) → 생김.
// 4) getPersonEpisodeTarget 정상 조합은 이름 반환, 잘못된 조합(다른 이벤트)은 null.
// 5) createEpisodeBridge 에 personId 전달 → Episode.personId 태깅 확인.
// 6) person_episode 갭이 에피소드 저장 후 사라짐.
// 7) Person 단독 삭제(deletePerson) → Episode 는 살아남고 personId 만 SetNull,
//    PersonLifeEvent 는 cascade 로 사라짐(계정 삭제 없이).
// 8) 계정 전체 삭제(deleteAccountTx) → LifeEvent/Episode/Person 고아 0건.
// 9) CORRECTED 이벤트(2026-09-01 픽스) — getConfirmedLifeEvent/
//    listConfirmedLifeEvents 가 포함하는지, person 갭·episode 갭(에피소드
//    저장까지) 둘 다 실제로 동작하는지.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { createEpisodeBridge } from "../lib/episode";
import { submitPersonAnswer, getPersonEpisodeTarget } from "../lib/person-chat";
import { detectGaps } from "../lib/gap-detector";
import { deletePerson } from "../lib/people";
import { getConfirmedLifeEvent, listConfirmedLifeEvents } from "../lib/life-event-query";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "person-mode-test-" } } });
}

function fail(msg: string): never {
  throw new Error(`FAILED — ${msg}`);
}

async function scenarioPersonMode() {
  console.log("=== v3 P6 인물 모드 검증 ===");

  const user = await prisma.user.create({
    data: { email: "person-mode-test-hana@test", name: "hana", birthYear: 1962 },
  });

  const highSchool = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "HIGH_SCHOOL",
      label: "고등학교 입학",
      year: 1978,
      isOptional: false,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder: 0,
    },
  });
  const military = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "MILITARY",
      label: "군 입대",
      year: 1981,
      isOptional: true,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder: 1,
    },
  });

  // --- 1) gap 전: 둘 다 person 갭 있어야 함
  const gapsBefore = await detectGaps(user.id);
  const personGapEventsBefore = gapsBefore
    .filter((g) => g.type === "person")
    .map((g) => g.targetEventId)
    .sort();
  console.log(
    "person gaps before (expect both):",
    personGapEventsBefore,
    personGapEventsBefore.length === 2 ? "OK" : "MISMATCH",
  );

  // --- 2) 거절 답변 — 저장 0, 캐묻지 않음
  const declineResult = await submitPersonAnswer(
    user.id,
    military.id,
    "군대에서 가깝게 지낸 전우 있으세요?",
    "기억이 잘 안 나요",
  );
  console.log("decline savedCount (expect 0):", declineResult.savedCount);
  if (declineResult.savedCount !== 0) fail("decline should save 0 persons");

  // --- 3) 실제 답변 — Sonnet 추출
  const result = await submitPersonAnswer(
    user.id,
    highSchool.id,
    "고등학교 다닐 때 친하게 지낸 사람 있으세요?",
    "영수라는 단짝 친구가 있었어요. 맨날 같이 다녔죠.",
  );
  console.log("extraction result:", result);
  if (result.savedCount === 0 || !result.firstPersonId) {
    fail("extraction found no person — check person-extract prompt");
  }
  const personId = result.firstPersonId;

  const person = await prisma.person.findUnique({ where: { id: personId } });
  console.log("person row:", person && {
    name: person.name,
    relation: person.relation,
    metYear: person.metYear,
    subjectType: person.subjectType,
    isDraft: person.isDraft,
  });
  if (!person || person.subjectType !== "person" || person.isDraft !== false) {
    fail("person row shape wrong");
  }
  if (person.metYear !== 1978) fail(`expected metYear=1978, got ${person.metYear}`);

  const link = await prisma.personLifeEvent.findFirst({
    where: { personId, lifeEventId: highSchool.id },
  });
  console.log("PersonLifeEvent link exists:", link !== null);
  if (!link) fail("PersonLifeEvent link missing");

  // --- 4) 갭 전이 확인
  const gapsMid = await detectGaps(user.id);
  const hasPersonGapHighSchool = gapsMid.some(
    (g) => g.type === "person" && g.targetEventId === highSchool.id,
  );
  const hasPersonEpisodeGap = gapsMid.some(
    (g) => g.type === "person_episode" && g.targetPersonId === personId,
  );
  const hasPersonGapMilitary = gapsMid.some(
    (g) => g.type === "person" && g.targetEventId === military.id,
  );
  console.log("person gap cleared for highSchool (expect false):", hasPersonGapHighSchool);
  console.log("person_episode gap present (expect true):", hasPersonEpisodeGap);
  console.log("person gap still present for military (expect true):", hasPersonGapMilitary);
  if (hasPersonGapHighSchool || !hasPersonEpisodeGap || !hasPersonGapMilitary) {
    fail("gap transition mismatch");
  }

  // --- 5) getPersonEpisodeTarget — 정상/오조합
  const target = await getPersonEpisodeTarget(user.id, highSchool.id, personId);
  console.log("getPersonEpisodeTarget name (expect 영수):", target?.personName);
  const mismatch = await getPersonEpisodeTarget(user.id, military.id, personId);
  console.log("getPersonEpisodeTarget mismatched pair (expect null):", mismatch);
  if (!target || mismatch !== null) fail("getPersonEpisodeTarget behavior wrong");

  // --- 6) 에피소드 저장(personId 태깅)
  const bridge = await createEpisodeBridge(
    user.id,
    highSchool.id,
    "고등학교 입학",
    1978,
    "영수랑 매일 자전거 타고 등교했어요.",
    "[동반자] 고등학교 다닐 때 친하게 지낸 사람 있으세요?\n[본인] 영수라는 단짝 친구가 있었어요.",
    personId,
  );
  if (!bridge) fail("createEpisodeBridge returned null");
  const episode = await prisma.episode.findUnique({ where: { id: bridge.episodeId } });
  console.log("Episode.personId tagged (expect true):", episode?.personId === personId);
  if (episode?.personId !== personId) fail("Episode.personId not tagged");

  // --- 7) person_episode 갭 소멸 확인
  const gapsAfterEpisode = await detectGaps(user.id);
  const stillHasPersonEpisodeGap = gapsAfterEpisode.some(
    (g) => g.type === "person_episode" && g.targetPersonId === personId,
  );
  console.log("person_episode gap cleared after episode (expect false):", stillHasPersonEpisodeGap);
  if (stillHasPersonEpisodeGap) fail("person_episode gap should be gone");

  // --- 8) Person 단독 삭제 — Episode 는 SetNull 로 생존, PersonLifeEvent 는 cascade
  const deleted = await deletePerson(user.id, personId);
  console.log("deletePerson succeeded:", deleted);
  const episodeAfterPersonDelete = await prisma.episode.findUnique({
    where: { id: bridge.episodeId },
  });
  console.log(
    "Episode survives person delete, personId SetNull (expect true / null):",
    episodeAfterPersonDelete !== null,
    episodeAfterPersonDelete?.personId,
  );
  if (episodeAfterPersonDelete === null || episodeAfterPersonDelete.personId !== null) {
    fail("Episode should survive with personId SetNull");
  }
  const linkAfterPersonDelete = await prisma.personLifeEvent.findFirst({ where: { personId } });
  console.log("PersonLifeEvent cascaded away with person (expect null):", linkAfterPersonDelete);
  if (linkAfterPersonDelete !== null) fail("PersonLifeEvent should cascade with Person");

  // --- 9) 계정 전체 삭제 — 고아 0건
  const beforeCounts = {
    lifeEvents: await prisma.lifeEvent.count({ where: { userId: user.id } }),
    episodes: await prisma.episode.count({
      where: { lifeEventId: { in: [highSchool.id, military.id] } },
    }),
  };
  console.log("before account deletion:", beforeCounts);

  await deleteAccountTx(user.id);

  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  const lifeEventsAfter = await prisma.lifeEvent.count({ where: { userId: user.id } });
  const episodesAfter = await prisma.episode.count({
    where: { lifeEventId: { in: [highSchool.id, military.id] } },
  });
  const personsAfter = await prisma.person.count({ where: { userId: user.id } });

  console.log("user deleted:", userAfter === null);
  console.log("LifeEvent orphans (expect 0):", lifeEventsAfter);
  console.log("Episode orphans (expect 0):", episodesAfter);
  console.log("Person orphans (expect 0):", personsAfter);

  if (userAfter !== null || lifeEventsAfter !== 0 || episodesAfter !== 0 || personsAfter !== 0) {
    fail("orphan rows remain after account deletion");
  }
}

// 2026-09-01 CORRECTED 상태 픽스 검증 — 확인질문에서 "아니요, 1975년이었어요"
// 처럼 연도를 정정한 이벤트가 person 갭·episode 갭 양쪽에서 실제로 동작하는지.
async function scenarioCorrectedStatus() {
  console.log("\n=== CORRECTED 상태 이벤트 — person 갭 + episode 갭 ===");

  const user = await prisma.user.create({
    data: { email: "person-mode-test-corrected@test", name: "corrected-user", birthYear: 1958 },
  });

  // 확인질문에서 연도를 1975 → 1977 로 정정한 상태를 흉내.
  const corrected = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "FIRST_JOB",
      label: "첫 직장",
      year: 1975,
      isOptional: true,
      status: "CORRECTED",
      confirmedAt: new Date(),
      correctedYear: 1977,
      correctedLabel: null,
      sequenceOrder: 0,
    },
  });

  // --- getConfirmedLifeEvent / listConfirmedLifeEvents 가 CORRECTED 포함하는지
  const single = await getConfirmedLifeEvent(user.id, corrected.id);
  console.log("getConfirmedLifeEvent 반환(expect non-null, year=1977):", single);
  if (!single || single.year !== 1977) fail("getConfirmedLifeEvent should include CORRECTED with correctedYear");

  const list = await listConfirmedLifeEvents(user.id);
  console.log("listConfirmedLifeEvents 포함 여부 (expect true):", list.some((e) => e.id === corrected.id));
  if (!list.some((e) => e.id === corrected.id)) fail("listConfirmedLifeEvents should include CORRECTED event");

  // --- person 갭이 CORRECTED 이벤트에도 뜨는지
  const gaps = await detectGaps(user.id);
  const hasPersonGap = gaps.some((g) => g.type === "person" && g.targetEventId === corrected.id);
  console.log("person 갭 존재 (expect true):", hasPersonGap);
  if (!hasPersonGap) fail("person gap missing for CORRECTED event");

  // --- person 갭 실제 흐름(실 API 호출)
  const personResult = await submitPersonAnswer(
    user.id,
    corrected.id,
    "그때 가깝게 지낸 동료 있으세요?",
    "미영이라는 동료가 있었어요.",
  );
  console.log("CORRECTED 이벤트 인물 추출 결과:", personResult);
  if (personResult.savedCount === 0 || !personResult.firstPersonId) {
    fail("submitPersonAnswer should work on CORRECTED event");
  }

  // --- episode 갭 실제 흐름 — 이전엔 status:"CONFIRMED" 단독 필터로 여기서
  // null 반환(저장 실패)했던 지점.
  const bridge = await createEpisodeBridge(
    user.id,
    corrected.id,
    "첫 직장",
    1977,
    "미영이랑 야근하면서 라면 많이 먹었어요.",
    "[동반자] 그때 가깝게 지낸 동료 있으세요?\n[본인] 미영이라는 동료가 있었어요.",
    personResult.firstPersonId,
  );
  console.log("CORRECTED 이벤트 createEpisodeBridge 결과 (expect non-null):", bridge);
  if (!bridge) fail("createEpisodeBridge should succeed on CORRECTED event");

  const episode = await prisma.episode.findUnique({ where: { id: bridge.episodeId } });
  console.log("Episode.personId 태깅 (expect true):", episode?.personId === personResult.firstPersonId);
  if (episode?.personId !== personResult.firstPersonId) fail("Episode.personId not tagged on CORRECTED event");

  await deleteAccountTx(user.id);
  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  console.log("user deleted:", userAfter === null);
  if (userAfter !== null) fail("CORRECTED scenario user not deleted");
}

async function main() {
  await cleanup();
  await scenarioPersonMode();
  await scenarioCorrectedStatus();
  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
