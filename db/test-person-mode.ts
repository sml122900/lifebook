// v3 P6 — 인물 모드 실검증. 실행: npx tsx db/test-person-mode.ts
//
// 실제 함수를 그대로 호출한다(재현 아님). 1~9·CORRECTED 는 지금 앱 경로 — /chat-v3 자유 대화의 인물 주제
// (startFreeTopic) → 본인 답 → 제안 카드(proposeFromSegment, 실제 Sonnet) → [만들기]/[안 만들기]
// (lib/free-chat.ts, My Life 개편 2단계). 옛 인물 단계(submitPersonAnswer)는 개편 2단계에서 삭제.
// 그 밖에 getPersonEpisodeTarget(lib/person-chat.ts), detectGaps, deletePerson/deleteAccountTx,
// getConfirmedLifeEvent/listConfirmedLifeEvents. 10·11 은 V2 온보딩 이야기 대화가 아직 쓰는
// 마무리 경로(finishEpisodeChatCore·savePeopleMentionedInEpisode) 그대로.
//
// 커버 시나리오:
// 1) "기억 안 나요" 류 답변 → 저장 0건(카드 없음), 캐묻지 않고 통과, 물어봤다(personAsked) 기록.
// 2) 실제 답변 → 카드의 사람 → [만들기] = Person(isDraft=false) + PersonLifeEvent + 이야기↔인물 CONFIRMED.
// 3) 갭 전이: person 갭(이벤트) → 사라짐, person_episode 갭(인물) → 생김.
// 4) getPersonEpisodeTarget 정상 조합은 이름 반환, 잘못된 조합(다른 이벤트)은 null.
// 5) 그 인물과의 이야기(person_episode 주제) → 카드 [만들기] → Episode.personId 태깅(NodeLink 중복 없음).
// 6) person_episode 갭이 에피소드 저장 후 사라짐.
// 7) Person 단독 삭제(deletePerson) → Episode 는 살아남고 personId 만 SetNull,
//    PersonLifeEvent 는 cascade 로 사라짐(계정 삭제 없이).
// 8) 계정 전체 삭제(deleteAccountTx) → LifeEvent/Episode/Person 고아 0건.
// 9) CORRECTED 이벤트(2026-09-01 픽스) — getConfirmedLifeEvent/
//    listConfirmedLifeEvents 가 포함하는지, person 갭·episode 갭(에피소드
//    저장까지) 둘 다 실제로 동작하는지.
// 10) P12-2 + 노드 그래프 2b-2 — 이야기 마무리 인물 추출(실제 Sonnet 1회)은 확인 없이 확정하지
//    않는다: 새 이름 = 초안 + 확인 대기 연결, PersonLifeEvent 없음, /people 미노출, 이야기의 대상
//    인물에는 연결을 안 만듦 → 확인(맞아요) 뒤 확정 + 연결 CONFIRMED + PersonLifeEvent.
// 11) E2E 후속(2026-11-01, 운영 test30 재현) — 이야기 내용 유실. 실제 Sonnet(인물 추출 1 + 요약 4 +
//    요약 뒤 인물 추출 3). ① 인물 질문 답("김민수라는 친구랑 매일 같이 등교했어요") + AI 가 끝낸
//    대화의 "네 그 정도예요" → 본문에 등교 내용, 마무리 말 없음(buildPersonEpisodeTranscript +
//    서버 마무리 문장 떼기) ② 마무리 말만 있는 턴 → 저장 안 함(LLM 0) ③ 맞장구만("네 맞아요") →
//    요약 모델 NO_CONTENT → 저장 안 함 ④ "한 시간 그 정도 걸었어요" 내용 문장 보존 ⑤ 여러 턴 내용 모두 반영.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { createEpisodeBridge } from "../lib/episode";
import {
  createFromFreeChatProposal,
  declineFreeChatProposal,
  proposeFromSegment,
  startFreeTopic,
  type FreeTopicInput,
} from "../lib/free-chat";
import { extractPersonCandidates, getPersonEpisodeTarget, savePeopleMentionedInEpisode } from "../lib/person-chat";
import { saveNodeLink } from "../lib/node-graph";
import { cardToEdit, createFromCard, personRow, type ProposalCard } from "../lib/node-proposal";

// 카드 사람 행 하나로 이야기 저장(지금 /chat-v3·인터뷰 카드와 같은 경로, LLM 0) → 연결된 인물 id.
async function saveViaCard(userId: string, eventId: string, name: string, relation: string): Promise<string | null> {
  const roster = await prisma.person.findMany({
    where: { userId, subjectType: "person", isDraft: false },
    select: { id: true, name: true, relation: true },
  });
  const row = await personRow(userId, name, relation, null, roster);
  const card: ProposalCard = {
    v: 1, title: "[test] person-mode", summary: `${name} 이야기`, center: { id: eventId, label: "", year: null }, centerFixed: false,
    people: [row], places: [], kind: "STORY", transcript: "", until: null, targetPersonId: null, isPeriod: false,
  };
  const result = await createFromCard(userId, card, cardToEdit(card));
  if (!result.ok) return null;
  const link = await prisma.nodeLink.findFirst({ where: { fromType: "EPISODE", fromId: result.episodeId, toType: "PERSON" }, select: { toId: true } });
  return link?.toId ?? null;
}
import { buildPersonAddress } from "../lib/person-honorific";
import { detectGaps } from "../lib/gap-detector";
import { deletePerson, listPeople } from "../lib/people";
import { countPendingPeople, decidePeople, getPendingPeopleGroups } from "../lib/node-confirm";
import { getConfirmedLifeEvent, listConfirmedLifeEvents } from "../lib/life-event-query";
import { finishEpisodeChatCore, type EpisodeTurn } from "../lib/episode-chat";
import { buildPersonEpisodeTranscript } from "../lib/episode-text";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "person-mode-test-" } } });
}

function fail(msg: string): never {
  throw new Error(`FAILED — ${msg}`);
}

const SESSION = "test-person-mode";

async function answer(userId: string, text: string) {
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: text } });
  await new Promise((r) => setTimeout(r, 5));
}

// 인물 주제로 대화 → 제안 카드 → 결정. 지금 앱 경로(/chat-v3 갭 칩·딥링크 → 본인 답 → [지금 이야기 남기기]·자동 제안
// 과 같은 proposeFromSegment → [만들기]/[안 만들기]). 내용이 없으면 카드 없이 넘어간다(모델이 그래도 카드를
// 만들면 사용자는 [안 만들기] — 결과는 같아야 한다).
async function talkThenDecide(userId: string, topic: FreeTopicInput, text: string, create: boolean) {
  const st = await startFreeTopic(userId, topic, SESSION);
  if (st.kind !== "opening") fail(`startFreeTopic: ${JSON.stringify(st)}`);
  await answer(userId, text);
  const p = await proposeFromSegment(userId);
  if (p.kind !== "card") return { card: null, made: null };
  if (!create) {
    await declineFreeChatProposal(userId);
    return { card: p.view.card, made: null };
  }
  const made = await createFromFreeChatProposal(userId);
  if (!made.ok) fail(`createFromFreeChatProposal: ${JSON.stringify(made)}`);
  return { card: p.view.card, made };
}

async function scenarioPersonMode() {
  console.log("=== v3 P6 인물 모드 검증(자유 대화 + 제안 카드 경로) ===");

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
  console.log("person gaps before (expect both):", personGapEventsBefore, personGapEventsBefore.length === 2 ? "OK" : "MISMATCH");
  if (personGapEventsBefore.length !== 2) fail("person gaps before");

  // --- 2) 거절 답변 — 저장 0, 캐묻지 않음(카드 없음), 물어봤다로 기록
  const decline = await talkThenDecide(user.id, { eventId: military.id, kind: "person" }, "기억이 잘 안 나요", false);
  const personsAfterDecline = await prisma.person.count({ where: { userId: user.id } });
  console.log("decline → card:", decline.card ? "있음(안 만들기)" : "없음", "/ persons (expect 0):", personsAfterDecline);
  if (personsAfterDecline !== 0) fail("decline should save 0 persons");

  // --- 3) 실제 답변 — 카드(Sonnet)의 사람 → [만들기] = 확정 인물 + PersonLifeEvent
  const real = await talkThenDecide(user.id, { eventId: highSchool.id, kind: "person" }, "영수라는 단짝 친구가 있었어요. 맨날 같이 다녔죠.", true);
  console.log("card:", real.card && { center: real.card.center, people: real.card.people });
  const person = await prisma.person.findFirst({ where: { userId: user.id, name: { contains: "영수" } } });
  console.log("person row:", person && { name: person.name, relation: person.relation, metYear: person.metYear, subjectType: person.subjectType, isDraft: person.isDraft });
  if (!real.card || !real.made || !person) fail("card/person missing — check proposal prompt");
  if (!("id" in real.card.center) || real.card.center.id !== highSchool.id) fail("card center should be the topic period");
  if (person.subjectType !== "person" || person.isDraft !== false) fail("person row shape wrong");
  if (person.metYear !== 1978) fail(`expected metYear=1978, got ${person.metYear}`);
  const personId = person.id;

  const link = await prisma.personLifeEvent.findFirst({ where: { personId, lifeEventId: highSchool.id } });
  console.log("PersonLifeEvent link exists:", link !== null);
  if (!link) fail("PersonLifeEvent link missing");
  const episodeLink = await prisma.nodeLink.findFirst({
    where: { fromType: "EPISODE", fromId: real.made.episodeId, toType: "PERSON", toId: personId },
  });
  console.log("이야기 ↔ 인물 연결 CONFIRMED (expect true):", episodeLink?.status === "CONFIRMED");
  if (episodeLink?.status !== "CONFIRMED") fail("episode-person link should be CONFIRMED (no PROPOSED)");

  // --- 4) 갭 전이 확인
  const gapsMid = await detectGaps(user.id);
  const hasPersonGapHighSchool = gapsMid.some((g) => g.type === "person" && g.targetEventId === highSchool.id);
  const hasPersonEpisodeGap = gapsMid.some((g) => g.type === "person_episode" && g.targetPersonId === personId);
  // P8-4 — military 는 2)에서 "기억이 잘 안 나요"로 답했다(저장 0 이지만 물어보긴 했다 → personAsked=true).
  const hasPersonGapMilitary = gapsMid.some((g) => g.type === "person" && g.targetEventId === military.id);
  console.log("person gap cleared for highSchool (expect false):", hasPersonGapHighSchool);
  console.log("person_episode gap present (expect true):", hasPersonEpisodeGap);
  console.log("person gap cleared for military after decline (expect false):", hasPersonGapMilitary);
  if (hasPersonGapHighSchool || !hasPersonEpisodeGap || hasPersonGapMilitary) fail("gap transition mismatch");

  // --- 5) getPersonEpisodeTarget — 정상/오조합
  const target = await getPersonEpisodeTarget(user.id, highSchool.id, personId);
  console.log("getPersonEpisodeTarget name (expect 영수):", target?.personName);
  const mismatch = await getPersonEpisodeTarget(user.id, military.id, personId);
  console.log("getPersonEpisodeTarget mismatched pair (expect null):", mismatch);
  if (!target || mismatch !== null) fail("getPersonEpisodeTarget behavior wrong");

  // --- 6) 그 인물과의 이야기(person_episode 주제) → Episode.personId 태깅
  const withPerson = await talkThenDecide(
    user.id,
    { eventId: highSchool.id, kind: "person_episode", personId },
    "영수랑 매일 자전거 타고 등교했어요. 비 오는 날엔 같이 우산을 썼지요.",
    true,
  );
  if (!withPerson.made) fail("person_episode story should make a card");
  const episode = await prisma.episode.findUnique({ where: { id: withPerson.made.episodeId } });
  console.log("Episode.personId tagged (expect true):", episode?.personId === personId);
  if (episode?.personId !== personId) fail("Episode.personId not tagged");
  const dupLink = await prisma.nodeLink.count({ where: { fromType: "EPISODE", fromId: withPerson.made.episodeId, toType: "PERSON", toId: personId } });
  console.log("대상 인물은 NodeLink 로 또 안 적음(한 쌍 = 한 곳) (expect 0):", dupLink);
  if (dupLink !== 0) fail("target person should not get a duplicate NodeLink");

  // --- 7) person_episode 갭 소멸 확인
  const gapsAfterEpisode = await detectGaps(user.id);
  const stillHasPersonEpisodeGap = gapsAfterEpisode.some((g) => g.type === "person_episode" && g.targetPersonId === personId);
  console.log("person_episode gap cleared after episode (expect false):", stillHasPersonEpisodeGap);
  if (stillHasPersonEpisodeGap) fail("person_episode gap should be gone");

  // --- 8) Person 단독 삭제 — Episode 는 SetNull 로 생존, PersonLifeEvent 는 cascade
  const deleted = await deletePerson(user.id, personId);
  console.log("deletePerson succeeded:", deleted);
  const episodeAfterPersonDelete = await prisma.episode.findUnique({ where: { id: withPerson.made.episodeId } });
  console.log("Episode survives person delete, personId SetNull (expect true / null):", episodeAfterPersonDelete !== null, episodeAfterPersonDelete?.personId);
  if (episodeAfterPersonDelete === null || episodeAfterPersonDelete.personId !== null) fail("Episode should survive with personId SetNull");
  const linkAfterPersonDelete = await prisma.personLifeEvent.findFirst({ where: { personId } });
  console.log("PersonLifeEvent cascaded away with person (expect null):", linkAfterPersonDelete);
  if (linkAfterPersonDelete !== null) fail("PersonLifeEvent should cascade with Person");

  // --- 9) 계정 전체 삭제 — 고아 0건
  await deleteAccountTx(user.id);
  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  const lifeEventsAfter = await prisma.lifeEvent.count({ where: { userId: user.id } });
  const episodesAfter = await prisma.episode.count({ where: { lifeEventId: { in: [highSchool.id, military.id] } } });
  const personsAfter = await prisma.person.count({ where: { userId: user.id } });
  console.log("user deleted:", userAfter === null);
  console.log("LifeEvent orphans (expect 0):", lifeEventsAfter);
  console.log("Episode orphans (expect 0):", episodesAfter);
  console.log("Person orphans (expect 0):", personsAfter);
  if (userAfter !== null || lifeEventsAfter !== 0 || episodesAfter !== 0 || personsAfter !== 0) fail("orphan rows remain after account deletion");
}

// 2026-09-01 CORRECTED 상태 픽스 검증 — 확인질문에서 "아니요, 1975년이었어요" 처럼 연도를 정정한 이벤트가
// person 갭·인물 주제 대화·이야기 저장에서 실제로 동작하는지.
async function scenarioCorrectedStatus() {
  console.log("\n=== CORRECTED 상태 이벤트 — person 갭 + 인물 주제 카드 저장 ===");

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

  // --- 인물 주제 대화 → 카드 → [만들기](실 API) — 이전엔 status:"CONFIRMED" 단독 필터로 저장이 깨지던 지점.
  const r = await talkThenDecide(user.id, { eventId: corrected.id, kind: "person" }, "미영이라는 동료가 있었어요. 야근하면서 라면 많이 먹었어요.", true);
  console.log("CORRECTED 이벤트 카드:", r.card && { center: r.card.center, people: r.card.people });
  if (!r.made) fail("person topic on CORRECTED event should make a card and save");
  if (r.made.eventId !== corrected.id) fail("story should be saved under the CORRECTED event");
  const episode = await prisma.episode.findUnique({ where: { id: r.made.episodeId }, include: { memory: { select: { year: true } } } });
  const mi = await prisma.person.findFirst({ where: { userId: user.id, name: { contains: "미영" } } });
  console.log("Episode 저장 (expect true) · 브릿지 연도 = 정정 연도 1977:", !!episode, episode?.memory.year, "/ 미영 metYear:", mi?.metYear);
  if (!episode || episode.memory.year !== 1977) fail("episode on CORRECTED event should use correctedYear");
  if (!mi || mi.isDraft || mi.metYear !== 1977) fail("person on CORRECTED event — confirmed, metYear = correctedYear");

  await deleteAccountTx(user.id);
  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  console.log("user deleted:", userAfter === null);
  if (userAfter !== null) fail("CORRECTED scenario user not deleted");
}

// P12-3/P12-2/P12-4/P12-5 — 인물 dedup + 에피소드 대화 중 인물 저장 + 호칭.
async function scenarioP12() {
  console.log("\n=== P12 — 인물 dedup · 에피소드 인물 추출 · 호칭 ===");

  // --- 호칭(순수 함수, API 없음)
  const addressCases: [string, string | null, string][] = [
    ["김부장", "부장", "김부장님과"],
    ["박정호", "담임 선생님", "박정호 선생님과"],
    ["박정호", "담임", "박정호 선생님과"],
    ["정미숙", "아내", "정미숙 씨와"],
    ["아내", "아내", "아내분과"],
    ["김영수", "남편", "김영수 씨와"],
    ["정영식", "선임", "정영식 선임과"],
    ["영수", "친구", "영수랑"],
    ["김순덕", "외할머니", "김순덕 할머니와"],
  ];
  for (const [name, relation, expected] of addressCases) {
    const got = buildPersonAddress(name, relation);
    console.log(`buildPersonAddress(${name}, ${relation}) → ${got}`, got === expected ? "OK" : `MISMATCH (expect ${expected})`);
    if (got !== expected) fail(`buildPersonAddress mismatch for ${name}/${relation}`);
  }

  const user = await prisma.user.create({
    data: { email: "person-mode-test-p12@test", name: "p12", birthYear: 1950 },
  });
  const elem = await prisma.lifeEvent.create({
    data: {
      userId: user.id, type: "ELEM_SCHOOL", label: "국민학교 입학", year: 1957,
      isOptional: false, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder: 0,
    },
  });
  const middle = await prisma.lifeEvent.create({
    data: {
      userId: user.id, type: "MIDDLE_SCHOOL", label: "중학교 입학", year: 1963,
      isOptional: false, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder: 1,
    },
  });

  // --- P12-3 dedup: 두 시기 카드에 같은 이름·호환 관계 → Person 1건, 링크 2건, metYear 첫 값
  // (지금 경로 = 제안 카드 사람 행 personRow + 저장 createFromCard — LLM 0)
  const r1 = await saveViaCard(user.id, elem.id, "박정호", "담임 선생님");
  const r2 = await saveViaCard(user.id, middle.id, "박정호", "담임 선생님");
  console.log("dedup results:", r1, r2);
  if (!r1 || r1 !== r2) fail("same-name person should dedup to one Person");
  const parkCount = await prisma.person.count({ where: { userId: user.id, name: "박정호" } });
  const parkLinks = await prisma.personLifeEvent.count({ where: { personId: r1 } });
  const park = await prisma.person.findUnique({ where: { id: r1 } });
  console.log("박정호 rows (expect 1):", parkCount, "/ links (expect 2):", parkLinks, "/ metYear (expect 1957):", park?.metYear);
  if (parkCount !== 1 || parkLinks !== 2 || park?.metYear !== 1957) fail("dedup shape wrong");

  // --- P12-4 성+직함 결합 호칭 → name 통째, 쪼개지 않음
  // (인물 추출 프롬프트 — V2 온보딩 이야기 대화 마무리가 아직 쓰는 extractPersonCandidates, 실제 Sonnet 1회)
  const r3 = await extractPersonCandidates("그때 가깝게 지낸 동료 있으세요?", "김부장님이 계셨어요.");
  console.log("김부장님 extraction:", r3);
  if (r3[0]?.name !== "김부장") fail(`expected name 김부장, got ${r3[0]?.name}`);
  console.log("address:", buildPersonAddress(r3[0].name, r3[0].relation));

  // --- P12-2 + 2b-2 에피소드 대화 중 언급된 인물(주인공 박정호 = 이야기의 대상 인물, 이순자 신규)
  // 실제 흐름처럼 이야기(박정호와의 이야기)를 먼저 저장하고, 그 이야기 id 로 추출·저장한다.
  const story = await createEpisodeBridge(
    user.id, middle.id, "중학교 입학", 1963,
    "운동회 때 박정호 선생님이 저희 반을 응원하시느라 목이 쉬셨다. 국어 선생님 이순자 씨도 다정하셨다.",
    "[본인] 운동회", r1,
  );
  if (!story) fail("episode bridge for P12-2 not created");
  const saved = await savePeopleMentionedInEpisode(
    user.id,
    middle.id,
    story.episodeId,
    "박정호 선생님과 기억나는 일 있으세요?",
    "운동회 때 저희 반을 응원하시느라 목이 쉬셨어요.\n국어 선생님 이순자 씨도 기억나요. 참 다정하셨죠.",
  );
  console.log("savePeopleMentionedInEpisode links:", saved);
  const lee = await prisma.person.findFirst({ where: { userId: user.id, name: "이순자" } });
  const parkCountAfter = await prisma.person.count({ where: { userId: user.id, name: "박정호" } });
  console.log("이순자 saved as draft (expect true):", lee?.isDraft, "/ 박정호 still 1 (expect 1):", parkCountAfter);
  if (!lee || !lee.isDraft || lee.companionSessionId !== null || parkCountAfter !== 1) fail("episode person extraction should create a draft");
  const leeLinkBefore = await prisma.personLifeEvent.findFirst({ where: { personId: lee.id, lifeEventId: middle.id } });
  const proposed = await prisma.nodeLink.findFirst({
    where: { userId: user.id, fromType: "EPISODE", fromId: story.episodeId, toType: "PERSON", toId: lee.id },
  });
  const parkLinked = await prisma.nodeLink.count({
    where: { userId: user.id, fromType: "EPISODE", fromId: story.episodeId, toType: "PERSON", toId: r1 },
  });
  console.log("확인 전 — PersonLifeEvent 없음(expect true):", leeLinkBefore === null, "/ 연결:", proposed?.status, proposed?.source, "/ 대상 인물 연결(expect 0):", parkLinked);
  if (leeLinkBefore) fail("이순자 must not be linked to the event before confirmation");
  if (proposed?.status !== "PROPOSED" || proposed.source !== "AI") fail("이순자 should have a PROPOSED AI link to the story");
  if (parkLinked !== 0) fail("the story subject (Episode.personId) must not get a NodeLink");
  if ((await listPeople(user.id)).some((p) => p.id === lee.id)) fail("draft must not appear in /people before confirmation");
  const row = (await getPendingPeopleGroups(user.id)).flatMap((g) => g.rows).find((r) => r.linkId === proposed.id);
  if (!row || row.registered) fail("confirm screen should list 이순자 as a new (unregistered) person");

  const decided = await decidePeople(user.id, [{ linkId: proposed.id, kind: "yes" }]);
  const leeAfter = await prisma.person.findUnique({ where: { id: lee.id } });
  const linkAfter = await prisma.nodeLink.findUnique({ where: { id: proposed.id } });
  const leeLink = await prisma.personLifeEvent.findFirst({ where: { personId: lee.id, lifeEventId: middle.id } });
  console.log("확인 후 — decided:", decided, "/ isDraft:", leeAfter?.isDraft, "/ 연결:", linkAfter?.status, "/ PersonLifeEvent:", leeLink !== null);
  if (decided.done.length !== 1 || leeAfter?.isDraft !== false || linkAfter?.status !== "CONFIRMED" || !leeLink) {
    fail("맞아요 should confirm the person, the link and add PersonLifeEvent");
  }
  if ((await countPendingPeople(user.id)) !== 0) fail("no pending people should remain");
  if (!(await listPeople(user.id)).some((p) => p.id === lee.id)) fail("confirmed person should appear in /people");

  await deleteAccountTx(user.id);
  const userAfter = await prisma.user.findUnique({ where: { id: user.id } });
  if (userAfter !== null) fail("P12 scenario user not deleted");
}

async function scenarioContentLoss() {
  console.log("\n=== 11. E2E 후속 — 이야기 내용 유실(운영 test30 재현) ===");
  const user = await prisma.user.create({
    data: { email: "person-mode-test-e2e@test", name: "e2e", birthYear: 1958 },
  });
  const mk = (type: "HIGH_SCHOOL" | "MILITARY", label: string, year: number, sequenceOrder: number) =>
    prisma.lifeEvent.create({
      data: { userId: user.id, type, label, year, isOptional: false, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder },
    });
  const hs = await mk("HIGH_SCHOOL", "고등학교 입학", 1974, 0);
  const mil = await mk("MILITARY", "군 입대", 1978, 1);
  const episodes = () => prisma.episode.count({ where: { lifeEvent: { userId: user.id } } });

  // ① 인물 질문(ChatV3Client buildPersonAskPrompt HIGH_SCHOOL 과 같은 문구) → 인물 저장 → 그 인물과의 이야기.
  const question = "고등학교 다닐 때 친하게 지낸 사람 있으세요?";
  const answer = "고등학교 때 김민수라는 친구랑 매일 같이 등교했어요";
  // 인물은 픽스처로(확정 인물 + 시기 연결 — 앱의 연결 입구 saveNodeLink). 이 시나리오의 대상은 마무리 경로.
  const minsu = await prisma.person.create({ data: { userId: user.id, name: "김민수", relation: "친구", metYear: 1974 } });
  const linked = await saveNodeLink(user.id, { type: "LIFE_EVENT", id: hs.id }, { type: "PERSON", id: minsu.id });
  if (!linked.ok) fail("fixture person link failed");
  const r = { firstPersonId: minsu.id, firstPersonName: minsu.name, firstPersonRelation: minsu.relation };
  const opening = `${buildPersonAddress(r.firstPersonName, r.firstPersonRelation)} 기억나는 일 있으세요?`;
  const transcript = buildPersonEpisodeTranscript(question, answer, opening);
  console.log("기록 시작 턴:", transcript.map((t) => t.role).join(","), "(expect assistant,user,assistant)");
  if (transcript.map((t) => t.role).join() !== "assistant,user,assistant") fail("person answer should be the first user turn");
  // AI 가 끝내기로 판단한 경로(②) — 클라는 마무리 말을 떼지 않고 넘긴다. 서버가 뗀다.
  const aiEnded: EpisodeTurn[] = [
    ...transcript,
    { role: "user", text: "네 그 정도예요" },
    { role: "assistant", text: "네, 잘 들었어요. 소중한 이야기 들려주셔서 고마워요." },
  ];
  const f1 = await finishEpisodeChatCore(user.id, hs.id, aiEnded, r.firstPersonId);
  if (!f1.ok) fail(`content-loss case should save: ${f1.error}`);
  const ep1 = await prisma.episode.findUnique({ where: { id: f1.episodeId }, select: { content: true, rawTranscript: true } });
  console.log("① 본문:", ep1?.content);
  if (!ep1 || !/등교|학교/.test(ep1.content) || /그\s*정도/.test(ep1.content)) fail("summary should keep the 등교 story and drop the closing remark");
  if (!ep1.rawTranscript?.includes("등교") || ep1.rawTranscript.includes("그 정도예요")) fail("stored transcript should include the person answer, not the closing remark");
  if ((await prisma.person.count({ where: { userId: user.id, name: "김민수" } })) !== 1) fail("김민수 should not be duplicated");
  if ((await countPendingPeople(user.id)) !== 0) fail("the story's subject person should not become a pending link");

  // ② 마무리 말만 있는 턴 → 저장 안 함(요약 모델 호출 전).
  const before2 = await episodes();
  const f2 = await finishEpisodeChatCore(user.id, mil.id, [
    { role: "assistant", text: "군대 시절 기억나는 일 있으세요?" },
    { role: "user", text: "네 그 정도예요" },
    { role: "assistant", text: "네, 잘 들었어요." },
  ]);
  console.log("② 마무리 말만:", JSON.stringify(f2));
  if (f2.ok || !f2.empty || (await episodes()) !== before2) fail("closing-only turn should not be saved");

  // ③ 맞장구만 — 코드 목록엔 없음 → 요약 모델이 NO_CONTENT → 저장 안 함.
  const f3 = await finishEpisodeChatCore(user.id, mil.id, [
    { role: "assistant", text: "그때 기분이 어떠셨어요?" },
    { role: "user", text: "네 맞아요" },
  ]);
  console.log("③ 맞장구만:", JSON.stringify(f3));
  if (f3.ok || !f3.empty || (await episodes()) !== before2) fail("affirmation-only turn should not be saved (NO_CONTENT)");

  // ④ "그 정도" 가 든 내용 문장은 보존.
  const f4 = await finishEpisodeChatCore(user.id, mil.id, [
    { role: "assistant", text: "군대 시절 기억나는 일 있으세요?" },
    { role: "user", text: "훈련소에서 매일 아침 한 시간 그 정도 걸었어요" },
  ]);
  if (!f4.ok) fail(`content sentence should be saved: ${f4.error}`);
  const ep4 = await prisma.episode.findUnique({ where: { id: f4.episodeId }, select: { content: true } });
  console.log("④ 본문:", ep4?.content);
  if (!ep4 || !/한\s*시간/.test(ep4.content)) fail("content sentence with '그 정도' should be kept");

  // ⑤ 여러 턴 — 앞 턴 내용까지 모두 반영, 끝의 마무리 말은 빠짐.
  const f5 = await finishEpisodeChatCore(user.id, hs.id, [
    { role: "assistant", text: "고등학교 시절 기억나는 일 있으세요?" },
    { role: "user", text: "운동장에서 축구를 자주 했어요" },
    { role: "assistant", text: "누구랑 하셨어요?" },
    { role: "user", text: "반 친구들이랑 점심시간마다 했어요" },
    { role: "assistant", text: "재밌으셨겠어요." },
    { role: "user", text: "네, 그게 다예요" },
  ]);
  if (!f5.ok) fail(`multi-turn should be saved: ${f5.error}`);
  const ep5 = await prisma.episode.findUnique({ where: { id: f5.episodeId }, select: { content: true } });
  console.log("⑤ 본문:", ep5?.content);
  if (!ep5 || !ep5.content.includes("축구") || !ep5.content.includes("점심") || /그게\s*다/.test(ep5.content)) {
    fail("multi-turn summary should include every turn's content and drop the closing remark");
  }

  await deleteAccountTx(user.id);
  if ((await prisma.user.findUnique({ where: { id: user.id } })) !== null) fail("content-loss scenario user not deleted");
}

async function main() {
  await cleanup();
  await scenarioPersonMode();
  await scenarioCorrectedStatus();
  await scenarioP12();
  await scenarioContentLoss();
  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
