// My Life 개편 2단계 — /chat-v3 자유 대화 + "노드로 만들까요?" 제안 카드 회귀.
// docs/phase/my-life-restructure.md §3, §7.1 2단계 완료 기준.
//
// 실행: npx tsx db/test-chat-proposal.ts          (LLM 0 검사 + 실제 모델 1편 — Haiku 응답 + Sonnet 제안)
//       npx tsx db/test-chat-proposal.ts --live   (+ 실제 모델 시나리오: 일단락 판단 / 6턴 강제 / 안 만들기 후 계속 /
//                                                   고치기 후 만들기 / 동명이인 + 이야기 1편 원가 /
//                                                   F 운영 test30 E2E 같은 문장 재현 — 별도 픽스처 fixture-chat-e2e@)
// ⑩(LLM 0) = 장소 이름 합쳐짐 되묻기 + 프롬프트 예시 소재가 픽스처·재현 대화와 겹치지 않는지.
// ⑪(LLM 0) = 제목 없음(빈 문자열) — 공용 판정 displayTitle·[고치기]에서 제목 지움·제목을 읽는 곳.
// ⚠️ .env 가 운영 DB — 자기 픽스처 계정(fixture-chat-proposal@·fixture-chat-e2e@lifebook.invalid)만 만들고 끝에 지운다.
// 실고객·test30 접촉 0. 원가 원장(ChatV3Usage)은 실제 호출 원가라 남긴다(탈퇴처럼 userId 만 비워짐).

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { deleteAccountTx } from "../lib/account-deletion";
import { costMicroUsd, dayStartKst } from "../lib/chat-v3-usage";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import { createEpisodeBridge } from "../lib/episode";
import {
  adoptLegacyPending,
  createFromFreeChatProposal,
  declineFreeChatProposal,
  decideProposal,
  freeChatReply,
  getFreeChatState,
  recentSavedStories,
  getFreeChatTopic,
  isAppNotice,
  parseReplyOutput,
  proposeFromSegment,
  replyResultFrom,
  startFreeTopic,
  substantiveUserTurns,
  type FreeChatReplyResult,
} from "../lib/free-chat";
import { FREE_CHAT_COPY } from "../lib/free-chat-copy";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { Prisma } from "../lib/generated/prisma/client";
import { getMyLifeData } from "../lib/my-life";
import { searchMyLife } from "../lib/my-life-search";
import { cardToEdit, createFromCard, overlappingPlaces, personRow, placeRow, type CardEdit, type ProposalCard } from "../lib/node-proposal";
import { periodMemoryId, syncV3Bridge } from "../lib/poster/v3-bridge";
import { buildFreeChatReplySystemPrompt, buildProposalUserMessage, PROPOSAL_SYSTEM_PROMPT } from "../lib/prompts/free-chat";
import { displayTitle } from "../lib/story-title";
import { getStoryReviewData } from "../lib/story-review";

const FIXTURE_EMAIL = "fixture-chat-proposal@lifebook.invalid";
const ROOT = path.resolve(__dirname, "..");
const LIVE = process.argv.includes("--live");
const SESSION = "test-chat-proposal";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function walk(dir: string): string[] {
  if (path.basename(dir) === "generated") return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
function exportedFirstStatements(rel: string): { name: string; first: string }[] {
  const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true);
  const out: { name: string; first: string }[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && (ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export) !== 0) {
      out.push({ name: st.name?.text ?? "(default)", first: st.body?.statements[0]?.getText(sf) ?? "" });
    }
  }
  return out;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fixture = { userId: string; ev: Record<string, string>; teacherId: string; friendId: string; uncleId: string; placeId: string };

async function removeFixture(): Promise<void> {
  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
}

// 1952년생 V3, 설정 끝(골격 확정). 확정 인물: 김민수(담임 선생님 — LLM 0 동명이인)·박영수(고교 친구)·
// 정다운(외삼촌 — 실제 모델 동명이인: 친구 정다운 이야기가 나오면 관계가 달라 자동으로 합치지 않고 되묻는다).
async function seedFixture(): Promise<Fixture> {
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: FIXTURE_EMAIL,
      name: "[fixture] chat proposal",
      birthYear: 1952,
      onboardingTrack: "V3",
      termsConsentAt: now,
      privacyConsentAt: now,
      overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: user.id, birthYear: 1952, region: "부산", skeletonGeneratedAt: now } });
  const rows: [LifeEventType, string, number | null][] = [
    ["BIRTH", "출생", 1952],
    ["ELEM_SCHOOL", "국민학교 입학", 1959],
    ["HIGH_SCHOOL", "고등학교 입학", 1968],
    ["MILITARY", "군 입대", 1973],
    ["FIRST_JOB", "첫 직장", 1976],
  ];
  const ev: Record<string, string> = {};
  for (const [i, [type, label, year]] of rows.entries()) {
    ev[type] = (
      await prisma.lifeEvent.create({
        data: { userId: user.id, type, label, year, status: "CONFIRMED", confirmedAt: now, sequenceOrder: i, personAsked: true },
        select: { id: true },
      })
    ).id;
  }
  const teacher = await prisma.person.create({ data: { userId: user.id, name: "김민수", relation: "담임 선생님", metYear: 1959 }, select: { id: true } });
  const friend = await prisma.person.create({ data: { userId: user.id, name: "박영수", relation: "고등학교 친구", metYear: 1968 }, select: { id: true } });
  const uncle = await prisma.person.create({ data: { userId: user.id, name: "정다운", relation: "외삼촌", metYear: 1952 }, select: { id: true } });
  await prisma.personLifeEvent.create({ data: { personId: friend.id, lifeEventId: ev.HIGH_SCHOOL, userId: user.id } });
  const place = await prisma.place.create({ data: { userId: user.id, name: "부산 해운대", source: "naver" }, select: { id: true } });
  return { userId: user.id, ev, teacherId: teacher.id, friendId: friend.id, uncleId: uncle.id, placeId: place.id };
}

function baseCard(over: Partial<ProposalCard>): ProposalCard {
  return {
    v: 1,
    title: "[fixture] 이야기",
    summary: "친구들과 해운대에 놀러 갔다.",
    center: { new: { label: "서울 상경", year: 1980 } },
    centerFixed: false,
    people: [],
    places: [],
    kind: "STORY",
    transcript: "[본인] 친구들과 해운대에 놀러 갔어요.",
    until: null,
    targetPersonId: null,
    isPeriod: false,
    ...over,
  };
}

async function say(userId: string, text: string): Promise<FreeChatReplyResult> {
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: text } });
  await sleep(5);
  const r = await freeChatReply(userId);
  if (r.kind === "reply") {
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: r.reply } });
    await sleep(5);
  }
  return r;
}

async function draftsAndProposed(userId: string) {
  return {
    drafts: await prisma.person.count({ where: { userId, isDraft: true } }),
    proposed: await prisma.nodeLink.count({ where: { userId, status: "PROPOSED" } }),
  };
}

// ─── LLM 0 ───────────────────────────────────────────────────────────────

function pureChecks() {
  const t = (role: string, content: string, ms: number) => ({ role, content, createdAt: new Date(1_700_000_000_000 + ms) });
  const story = [t("assistant", "고등학교 다닐 때 기억나는 일 있으세요?", 0), t("user", "수학여행을 경주로 갔어요.", 1), t("assistant", "누구랑 가셨어요?", 2), t("user", "박영수랑 같이 갔지요.", 3)];
  check("① 실질 턴 — 마무리 말뿐인 턴·종료 말은 안 셈", substantiveUserTurns([...story, t("user", "그 정도예요.", 4), t("user", "그만할래요", 5)]) === 2);
  check("① done + 실질 2턴 → 제안(전체)", JSON.stringify(decideProposal("done", story)) === JSON.stringify({ until: null }));
  check("① done + 실질 1턴 → 제안 안 함(하한)", decideProposal("done", story.slice(0, 2)) === null);
  check("① 마무리 말 + 실질 1턴 → 제안", JSON.stringify(decideProposal("continue", [...story.slice(0, 2), t("user", "그게 다예요.", 4)])) === JSON.stringify({ until: null }));
  check("① 인사뿐 + 마무리 말 → 제안 안 함", decideProposal("continue", [t("user", "그 정도예요.", 1)]) === null);
  const shifted = [...story, t("assistant", "좋았겠어요.", 4), t("user", "군대 이야기도 할게요. 훈련소가 논산이었어요.", 5)];
  check("① topic_shift → 방금 턴 직전까지 제안(until = 방금 턴 시각)", decideProposal("topic_shift", shifted)?.until === new Date(1_700_000_000_005).toISOString());
  check("① topic_shift 인데 앞 이야기 없음 → 제안 안 함", decideProposal("topic_shift", [t("user", "군대 이야기 할게요.", 1)]) === null);
  const six = Array.from({ length: 6 }, (_, i) => t("user", `이야기 ${i + 1}번째 문장이에요.`, i));
  check("① 실질 6턴 → continue 여도 제안(상한)", JSON.stringify(decideProposal("continue", six)) === JSON.stringify({ until: null }));
  check("① 실질 5턴 continue → 제안 안 함", decideProposal("continue", six.slice(0, 5)) === null);
  check("① 원가 — Haiku 1000/200 토큰 = 2000µ$, Sonnet = 6000µ$", costMicroUsd("claude-haiku-4-5-20251001", 1000, 200) === 2000 && costMicroUsd("claude-sonnet-4-6", 1000, 200) === 6000);
  check("① 하루 시작 = KST 0시", dayStartKst(new Date("2026-11-01T14:59:00Z")).toISOString() === "2026-10-31T15:00:00.000Z" && dayStartKst(new Date("2026-11-01T15:00:00Z")).toISOString() === "2026-11-01T15:00:00.000Z");
}

function staticChecks() {
  const actions = exportedFirstStatements("app/actions/free-chat.ts");
  check("⑦ 자유 대화 서버 액션 6개 · 첫 줄 = requireUserId()", actions.length === 6 && actions.every((a) => /^const userId = await requireUserId\(\);$/.test(a.first)), actions);
  const appFiles = walk(path.join(ROOT, "app"));
  const uses = (re: RegExp) => appFiles.filter((f) => re.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
  // 호출·import 만 본다(주석의 이름은 제외).
  const promote = /(promoteOpenTurn|respondToOpenChat|submitPersonAnswer)\s*\(|from\s+["'][^"']*(open-chat|actions\/person-chat)["']/;
  check("⑦ 자유 발화 즉시 중심 생성 0 — app 에서 promoteOpenTurn·respondToOpenChat·submitPersonAnswer 호출 없음", uses(promote).length === 0, uses(promote));
  const proposedPath = /(savePeopleMentionedInEpisode|saveProposedPeople|finishEpisodeChatCore)\s*\(/;
  const chatFiles = [
    ...walk(path.join(ROOT, "app/chat-v3")),
    ...walk(path.join(ROOT, "app/interview")),
    path.join(ROOT, "lib/interview/session.ts"),
    path.join(ROOT, "lib/free-chat.ts"),
  ];
  check("⑦ /chat-v3·인터뷰가 확인 대기를 만드는 경로 0 — 인물 추출 저장 호출 없음", chatFiles.every((f) => !proposedPath.test(fs.readFileSync(f, "utf8"))));
  check("⑦ /chat-v3 대화창 확인 카드 제거", !read("app/chat-v3/ChatV3Client.tsx").includes("CONFIRM_COPY"));
  check("⑦ /enter V3 설정 완료 → /my-life(Q68)", /if \(unconfirmed === 0\) \{\s*redirect\("\/my-life"\);/.test(read("app/enter/page.tsx")));
  check("⑦ /my-life 채팅 진입 버튼(→ /chat-v3)", (read("app/my-life/MyLifeView.tsx").match(/href="\/chat-v3"/g) ?? []).length >= 3);
  check("⑦ proxy.ts 무접촉(자유 대화 언급 없음)", !/free-chat|chat-v3/.test(read("proxy.ts")));
  check("⑦ 제안 호출 후보에 장소 목록 없음(Q70) — 프롬프트 입력에 장소 칸 없음", !read("lib/prompts/free-chat.ts").includes("[이미 있는 장소]") && !/places:\s*\{\s*id/.test(read("lib/prompts/free-chat.ts")));
}

async function cardChecks(fx: Fixture) {
  const { userId, ev, teacherId, placeId } = fx;
  const before = {
    events: await prisma.lifeEvent.count({ where: { userId } }),
    episodes: await prisma.episode.count({ where: { lifeEvent: { userId } } }),
    people: await prisma.person.count({ where: { userId } }),
    places: await prisma.place.count({ where: { userId } }),
  };
  // 새 이름 "김민수"(친구) — 확정 인물 김민수(담임 선생님)와 이름만 같음 → 되묻기, 아무것도 저장 안 함.
  const card = baseCard({
    people: [{ name: "김민수", relation: "친구", personId: null, sameName: [{ id: teacherId, name: "김민수", relation: "담임 선생님" }] }],
    places: [{ name: "부산 해운대", placeId: null }, { name: "경주 불국사", placeId: null }],
  });
  const asked = await createFromCard(userId, card, cardToEdit(card));
  const mid = {
    events: await prisma.lifeEvent.count({ where: { userId } }),
    episodes: await prisma.episode.count({ where: { lifeEvent: { userId } } }),
    people: await prisma.person.count({ where: { userId } }),
    places: await prisma.place.count({ where: { userId } }),
  };
  check("② 같은 이름 확정 인물 → 되묻기(행 0), 아무것도 저장 안 함",
    !asked.ok && asked.reason === "ask" && asked.ask[0]?.index === 0 && asked.ask[0].candidates[0]?.id === teacherId && JSON.stringify(before) === JSON.stringify(mid),
    { asked, before, mid });

  // 다른 분이에요 → 새 사람. 새 시기(1980 서울 상경)는 연도 순 자리(군 입대·첫 직장 뒤).
  const edit: CardEdit = { ...cardToEdit(card), people: [{ name: "김민수", relation: "친구", personId: null, decision: "different" }] };
  const made = await createFromCard(userId, card, edit);
  check("② [다른 분이에요] → 만들기 성공(새 시기·사람 1·장소 2)", made.ok && made.created.center && made.created.people === 1 && made.created.places === 2, made);
  if (!made.ok) return;
  const center = await prisma.lifeEvent.findUnique({ where: { id: made.eventId } });
  const order = await prisma.lifeEvent.findMany({ where: { userId }, orderBy: { sequenceOrder: "asc" }, select: { label: true } });
  check("② 새 시기 = CUSTOM·CONFIRMED·1980·연도 순 자리", center?.type === "CUSTOM" && center.status === "CONFIRMED" && center.year === 1980 && order.map((o) => o.label).join(",") === "출생,국민학교 입학,고등학교 입학,군 입대,첫 직장,서울 상경", order);
  const episode = await prisma.episode.findUnique({ where: { id: made.episodeId }, include: { memory: { select: { title: true, content: true } } } });
  check("② 이야기 = 본문·대화 기록·제목·STORY", episode?.content === card.summary && episode.rawTranscript === card.transcript && episode.memory.title === card.title && episode.kind === "STORY" && episode.lifeEventId === made.eventId);
  const newPeople = await prisma.person.findMany({ where: { userId, name: "김민수" }, select: { id: true, relation: true, isDraft: true, metYear: true } });
  const newMinsu = newPeople.find((p) => p.id !== teacherId);
  check("② 새 김민수(친구) = 확정 인물(초안 아님)·만난 해 = 시기 연도", newPeople.length === 2 && !!newMinsu && !newMinsu.isDraft && newMinsu.relation === "친구" && newMinsu.metYear === 1980, newPeople);
  const links = await prisma.nodeLink.findMany({ where: { userId, fromType: "EPISODE", fromId: made.episodeId } });
  const ple = await prisma.personLifeEvent.count({ where: { personId: newMinsu?.id ?? "", lifeEventId: made.eventId } });
  check("② 사람 연결 = CONFIRMED 이야기→사람 1 + 중심→사람(PersonLifeEvent) 1", links.length === 1 && links[0].toId === newMinsu?.id && links[0].status === "CONFIRMED" && ple === 1, links);
  const mp = await prisma.memoryPlace.findMany({ where: { memoryId: episode?.memoryId ?? "" }, orderBy: { sortOrder: "asc" }, select: { placeId: true, placeName: true } });
  const places = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true } });
  check("② 장소 = 있는 곳(부산 해운대) 재사용 + 새 곳(경주 불국사) 1개 생성 · 이야기 장소 2행", mp.length === 2 && mp[0].placeId === placeId && places.length === 2 && places.some((p) => p.name === "경주 불국사"), { mp, places });
  check("② 확인 대기 0(초안·PROPOSED 없음)", JSON.stringify(await draftsAndProposed(userId)) === JSON.stringify({ drafts: 0, proposed: 0 }));

  // 같은 분이에요 + 출생 시기 + 비가족 새 사람(만난 해 비움) + 가족(만난 해 = 시기 연도).
  const card2 = baseCard({
    title: "[fixture] 어릴 적",
    center: { id: ev.BIRTH, label: "출생", year: 1952 },
    people: [
      { name: "김민수", relation: "선생님", personId: null, sameName: [] },
      { name: "이철수", relation: "이웃", personId: null, sameName: [] },
      { name: "박순자", relation: "어머니", personId: null, sameName: [] },
    ],
  });
  const ask2 = await createFromCard(userId, card2, cardToEdit(card2));
  check("② 고친 이름이 아니어도 같은 이름이면 되묻기(김민수 2명 후보)", !ask2.ok && ask2.reason === "ask" && ask2.ask[0]?.candidates.length === 2, ask2);
  const made2 = await createFromCard(userId, card2, {
    ...cardToEdit(card2),
    people: [
      { name: "김민수", relation: "선생님", personId: null, decision: "same", samePersonId: teacherId },
      { name: "이철수", relation: "이웃", personId: null },
      { name: "박순자", relation: "어머니", personId: null },
    ],
  });
  const lee = await prisma.person.findFirst({ where: { userId, name: "이철수" }, select: { metYear: true } });
  const mom = await prisma.person.findFirst({ where: { userId, name: "박순자" }, select: { metYear: true } });
  const teacherLinked = made2.ok ? await prisma.nodeLink.count({ where: { fromId: made2.episodeId, toId: teacherId, status: "CONFIRMED" } }) : 0;
  check("② [같은 분이에요] → 기존 인물에 연결(새 사람 안 만듦)", made2.ok && teacherLinked === 1 && (await prisma.person.count({ where: { userId, name: "김민수" } })) === 2, made2);
  check("② 만난 해 — 출생 시기 + 비가족 = 비움 · 가족 = 출생 연도(Q33)", lee?.metYear === null && mom?.metYear === 1952, { lee, mom });

  // 모델의 "이미 계신 분" 맞춤도 관계가 안 맞으면 믿지 않는다(실측 결함 — 친구 정다운 → 외삼촌 정다운).
  const roster = await prisma.person.findMany({ where: { userId, isDraft: false }, select: { id: true, name: true, relation: true } });
  const wrongMatch = await personRow(userId, "정다운", "동네 친구", fx.uncleId, roster);
  const rightMatch = await personRow(userId, "정다운", "외삼촌", fx.uncleId, roster);
  const byName = await personRow(userId, "박영수", "친구", null, roster);
  check("② 모델 맞춤 + 관계 불일치 → 새 이름 + 되묻기 / 관계 일치 → 이미 계신 분 / 맞춤 없어도 이름·관계 호환 → 이미 계신 분",
    wrongMatch.personId === null && wrongMatch.sameName.some((s) => s.id === fx.uncleId) && rightMatch.personId === fx.uncleId && byName.personId === fx.friendId,
    { wrongMatch, rightMatch, byName });
  // 모델이 다른 분의 id 를 붙인 경우(실측 결함 — "박영수"에 김민수(친구) id) → 그 id 는 버리고 이름으로 박영수.
  const otherFriend = roster.find((r) => r.name === "김민수" && r.relation === "친구");
  const wrongId = await personRow(userId, "박영수", "친구", otherFriend?.id ?? null, roster);
  const shortName = await personRow(userId, "영수", "고등학교 친구", fx.friendId, roster);
  check("② 모델 맞춤 + 이름 불일치 → 그 id 무시하고 이름으로(박영수) / \"영수\" ↔ 박영수는 같은 이름으로",
    !!otherFriend && wrongId.personId === fx.friendId && shortName.personId === fx.friendId,
    { otherFriend, wrongId, shortName });

  // 남의 것·없는 것은 믿지 않는다.
  const bad = await createFromCard(userId, card2, { ...cardToEdit(card2), center: { id: "c_not_mine" }, people: [] });
  check("② 남의(없는) 시기 id → 거부", !bad.ok && bad.reason === "invalid", bad);
  const ghost = await createFromCard(userId, baseCard({ title: "[fixture] 유령" }), {
    ...cardToEdit(baseCard({})),
    title: "[fixture] 유령",
    center: { id: ev.HIGH_SCHOOL },
    people: [{ name: "최유령", relation: "친구", personId: "p_not_mine" }],
    places: [{ name: "유령 장소", placeId: "pl_not_mine" }],
  });
  const ghostPerson = await prisma.person.findFirst({ where: { userId, name: "최유령" }, select: { id: true } });
  check("② 남의(없는) 사람·장소 id → 무시하고 이름으로 새로", ghost.ok && !!ghostPerson && (await prisma.place.count({ where: { userId, name: "유령 장소" } })) === 1, ghost);
  const empty = await createFromCard(userId, card2, { ...cardToEdit(card2), summary: "  ", people: [] });
  check("② 빈 내용 → 거부(빈 제목은 저장 — ⑪)", !empty.ok && empty.reason === "invalid");
}

async function segmentChecks(fx: Fixture) {
  const { userId, ev, friendId } = fx;
  const usage0 = await prisma.chatV3Usage.count({ where: { userId } });

  // 주제 시작 — 고른 말(구간 밖) → 경계 → 오프닝(구간 첫 말).
  const st = await startFreeTopic(userId, { eventId: ev.HIGH_SCHOOL, kind: "episode" }, SESSION);
  const seg = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  const log = await prisma.onboardingChatMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 2 });
  check("③ 주제 시작 = 고른 말·오프닝 저장, 경계는 그 사이",
    st.kind === "opening" && st.announce === "고등학교 입학 이야기도 해볼게요" && log[1].content === st.announce && log[0].content === st.opening &&
      log[1].createdAt < seg.startedAt && log[0].createdAt >= seg.startedAt && seg.topicEventId === ev.HIGH_SCHOOL && seg.topicGapType === "episode",
    st);
  check("③ 주제 시작 직후 실질 턴 0", (await getFreeChatState(userId)).segmentTurns === 0);

  // 인사뿐이면 제안 호출 안 함(원가 0).
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "그 정도예요." } });
  const none = await proposeFromSegment(userId);
  check("③ 마무리 말뿐 → 카드 없음·모델 호출 0", none.kind === "none" && (await prisma.chatV3Usage.count({ where: { userId } })) === usage0, none);

  // 카드가 떠 있으면 새 주제를 시작하지 않는다 / [안 만들기] = 저장 0 + 구간을 카드 뒤로.
  await sleep(5);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "수학여행을 경주로 갔어요." } });
  await sleep(5);
  const until = new Date();
  await sleep(5);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "카드 뒤에 한 말이에요." } });
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { proposal: baseCard({ title: "[fixture] 카드", center: { id: ev.HIGH_SCHOOL, label: "고등학교 입학", year: 1968 }, until: until.toISOString() }) as unknown as Prisma.InputJsonValue },
  });
  check("③ 카드가 떠 있으면 새 주제 시작 안 함", (await startFreeTopic(userId, { eventId: ev.MILITARY, kind: "episode" }, SESSION)).kind === "pending");
  const stateWithCard = await getFreeChatState(userId);
  check("③ 재진입 = 카드부터(대화 기록 없이 보냄) · 카드 뒤 대화 1턴", stateWithCard.proposal?.card.title === "[fixture] 카드" && !("transcript" in (stateWithCard.proposal?.card ?? {})) && stateWithCard.segmentTurns === 1, stateWithCard);
  const episodes0 = await prisma.episode.count({ where: { lifeEvent: { userId } } });
  const dec = await declineFreeChatProposal(userId);
  const segD = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("③ [안 만들기] = 저장 0 · 카드 비움 · 구간 = 카드 뒤(1턴 남음) · 주제 끝",
    (await prisma.episode.count({ where: { lifeEvent: { userId } } })) === episodes0 && segD.proposal === null && segD.startedAt.getTime() === until.getTime() && dec.segmentTurns === 1 && segD.topicEventId === null,
    { dec, startedAt: segD.startedAt, until });

  // [만들기](카드 그대로) — 구간 이동·방금 만든 제목 기억(최대 2).
  const until2 = new Date();
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { proposal: baseCard({ title: "[fixture] 만든 카드", center: { id: ev.MILITARY, label: "군 입대", year: 1973 }, until: until2.toISOString() }) as unknown as Prisma.InputJsonValue },
  });
  const made = await createFromFreeChatProposal(userId);
  const segM = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("③ [만들기] = 이야기 저장 · 카드 비움 · 구간 = 카드 뒤 · 방금 만든 제목 기억",
    made.ok && segM.proposal === null && segM.startedAt.getTime() === until2.getTime() && segM.recentTitles[0] === "[fixture] 만든 카드" && made.segmentTurns === 0,
    made);
  const again = await createFromFreeChatProposal(userId);
  check("③ 카드 없이 [만들기] → no_card(두 번 눌러도 1개)", !again.ok && again.reason === "no_card");

  // 개편 전 대기 대화 → 자유 대화 주제로 이어받고 지움.
  await prisma.chatV3PendingContext.create({ data: { userId, stage: "EPISODE", targetEventId: ev.HIGH_SCHOOL, targetPersonId: friendId } });
  const adopted = await adoptLegacyPending(userId);
  const segA = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("③ 옛 대기 대화(인물 이야기) → 주제(person_episode)로 이어받고 대기 행 삭제",
    adopted && segA.topicEventId === ev.HIGH_SCHOOL && segA.topicGapType === "person_episode" && segA.topicPersonId === friendId &&
      (await prisma.chatV3PendingContext.count({ where: { userId } })) === 0);

  // 하루 예산 — 넘으면 응답·제안 모델을 부르지 않는다.
  const prev = process.env.CHAT_V3_DAILY_BUDGET_USD;
  process.env.CHAT_V3_DAILY_BUDGET_USD = "0";
  try {
    const usage1 = await prisma.chatV3Usage.count({ where: { userId } });
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "예산 확인용 이야기예요. 친구랑 바다에 갔어요." } });
    const r = await freeChatReply(userId);
    const p = await proposeFromSegment(userId);
    check("④ 예산 0 → 응답 budget · 제안 budget · 모델 호출 0", r.kind === "budget" && p.kind === "budget" && (await prisma.chatV3Usage.count({ where: { userId } })) === usage1, { r, p });
  } finally {
    if (prev === undefined) delete process.env.CHAT_V3_DAILY_BUDGET_USD;
    else process.env.CHAT_V3_DAILY_BUDGET_USD = prev;
  }
}

// ─── 응답 폴백(말투 안전장치) — 잘린·깨진 모델 출력 ──────────────────────

// (a) 화면에 내보내는 답에 JSON·코드 흔적이 절대 없어야 한다. LLM 0.
function fallbackOutputChecks() {
  const clean = (s: string | null) => s === null || (!/[{}[\]`]/.test(s) && !/"?\b(reply|segment)\b"?\s*:/i.test(s));
  const cases: { label: string; raw: string; reply: string | null; segment?: string }[] = [
    { label: "온전한 JSON", raw: '{"reply": "그 이야기 잘 들었어요.", "segment": "done"}', reply: "그 이야기 잘 들었어요.", segment: "done" },
    { label: "코드 울타리 안 JSON", raw: '```json\n{"reply": "네, 그러셨군요.", "segment": "continue"}\n```', reply: "네, 그러셨군요.", segment: "continue" },
    { label: "JSON 없이 문장만", raw: "그때 참 힘드셨겠어요.", reply: "그때 참 힘드셨겠어요.", segment: "continue" },
    { label: "따옴표로 감싼 문장", raw: '"그 이야기 잘 들었어요."', reply: "그 이야기 잘 들었어요." },
    { label: "잘린 JSON — 답 문자열은 온전", raw: '{"reply": "잘 들었어요. 고마워요.", "segm', reply: "잘 들었어요. 고마워요.", segment: "continue" },
    { label: "잘린 JSON — 답 문자열도 잘림", raw: '{"reply": "잘 들었', reply: null },
    { label: "중괄호로 시작한 깨진 출력", raw: "{ 잠시만요", reply: null },
    { label: "중괄호 없는 키 조각(따옴표 키)", raw: '"reply": "잘 들었어요", "segment": "done"', reply: "잘 들었어요", segment: "continue" },
    { label: "중괄호 없는 키 조각(맨 키)", raw: "reply: 잘 들었어요", reply: null },
    { label: "코드 울타리만", raw: "```json", reply: null },
    { label: "JSON 인데 답에 중괄호", raw: '{"reply": "{그때} 좋았네요", "segment": "continue"}', reply: null },
  ];
  for (const c of cases) {
    const out = parseReplyOutput(c.raw);
    check(
      `⑧ 폴백(a) ${c.label} → ${c.reply === null ? "기본 문구" : "그 문장"}${c.segment ? `·${c.segment}` : ""}`,
      out.reply === c.reply && (!c.segment || out.segment === c.segment) && clean(out.reply),
      out,
    );
  }
  const unreadable = replyResultFrom("{ 깨진", [], false);
  check("⑧ 폴백(a) 못 읽으면 화면엔 기본 문구(JSON 흔적 0)", unreadable.reply === "네, 이야기 잘 듣고 있어요.", unreadable.reply);
}

// (b) 문장만 온 턴·못 읽은 턴도 6턴 강제 제안에 그대로 센다(본인 턴 수 = 로그) — 실제 DB 의 구간 로그로.
async function fallbackCountChecks(fx: Fixture) {
  const { userId } = fx;
  await prisma.chatV3Segment.update({ where: { userId }, data: { startedAt: new Date(), proposal: Prisma.DbNull, topicEventId: null, topicGapType: null, topicPersonId: null } });
  await sleep(5);
  const lines = [
    "첫 직장은 부산 국제시장 옆 신발 공장이었어요.",
    "아침 일곱 시까지 출근했어요.",
    "점심은 공장 식당에서 국수를 먹었지요.",
    "월급날이면 동료들이랑 돼지국밥을 먹으러 갔어요.",
    "공장장님이 엄하셨는데 정이 많은 분이었어요.",
    "겨울엔 손이 많이 시렸어요.",
  ];
  const turnsOf = async () => {
    const seg = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId }, select: { startedAt: true } });
    const rows = await prisma.onboardingChatMessage.findMany({ where: { userId, createdAt: { gte: seg.startedAt } }, orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } });
    return rows.map((r) => ({ role: r.role as string, content: r.content, createdAt: r.createdAt }));
  };
  for (let i = 0; i < lines.length; i++) {
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: lines[i] } });
    await sleep(5);
    if (i === 4) {
      const five = replyResultFrom("그때 참 고생하셨겠어요.", await turnsOf(), false);
      check("⑧ 폴백(b) 문장만 온 5턴째 → 아직 제안 없음·실질 5턴", five.propose === null && five.segmentTurns === 5, five);
    }
    // 앞 턴들의 답은 문장만 온 것으로(폴백 경로) 로그에 남긴다. 6턴째는 본인 말로 끝(응답 직전 상태).
    if (i < lines.length - 1) {
      await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: "그때 참 고생하셨겠어요." } });
      await sleep(5);
    }
  }
  const turns = await turnsOf();
  const plainSix = replyResultFrom("그때 참 고생하셨겠어요.", turns, false);
  const brokenSix = replyResultFrom('{"reply": "잘 들었', turns, false);
  check("⑧ 폴백(b) 문장만 온 6턴째 → 6턴 강제 제안", JSON.stringify(plainSix.propose) === JSON.stringify({ until: null }) && plainSix.segmentTurns === 6, plainSix);
  check("⑧ 폴백(b) 못 읽은 6턴째(기본 문구) → 그래도 6턴 강제 제안", brokenSix.reply === "네, 이야기 잘 듣고 있어요." && JSON.stringify(brokenSix.propose) === JSON.stringify({ until: null }), brokenSix);
  check("⑧ 폴백(b) 카드가 떠 있으면 6턴이어도 새 제안 없음", replyResultFrom("그때 참 고생하셨겠어요.", turns, true).propose === null);
  // 실제 응답(Haiku 1회) — 모델 출력이 무엇이든 6턴째면 제안.
  const real = await freeChatReply(userId);
  check("⑧ 폴백(b) 실제 응답 6턴째 → 제안 · 화면 답에 JSON 흔적 없음",
    real.kind === "reply" && JSON.stringify(real.propose) === JSON.stringify({ until: null }) && real.segmentTurns === 6 && !/[{}`]|"?(reply|segment)"?s*:/.test(real.reply),
    real);
  return turns.length;
}

// ─── 실제 모델 ───────────────────────────────────────────────────────────

async function resetSegment(userId: string, eventId: string | null) {
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { startedAt: new Date(), proposal: Prisma.DbNull, topicEventId: eventId, topicGapType: eventId ? "episode" : null, topicPersonId: null },
  });
  await sleep(5);
}

async function usageSince(userId: string, since: Date) {
  const rows = await prisma.chatV3Usage.findMany({ where: { userId, createdAt: { gte: since } }, select: { purpose: true, model: true, inputTokens: true, outputTokens: true, costMicroUsd: true } });
  const sum = (p?: string) => rows.filter((r) => !p || r.purpose === p);
  return {
    calls: rows.length,
    reply: { calls: sum("REPLY").length, in: sum("REPLY").reduce((n, r) => n + r.inputTokens, 0), out: sum("REPLY").reduce((n, r) => n + r.outputTokens, 0), model: sum("REPLY")[0]?.model ?? null },
    proposal: { calls: sum("PROPOSAL").length, in: sum("PROPOSAL").reduce((n, r) => n + r.inputTokens, 0), out: sum("PROPOSAL").reduce((n, r) => n + r.outputTokens, 0), model: sum("PROPOSAL")[0]?.model ?? null },
    usd: rows.reduce((n, r) => n + r.costMicroUsd, 0) / 1_000_000,
  };
}

// 기본 1편 — 마무리 말로 끝내는 이야기(제안 시점은 코드 규칙으로 결정적) → 실제 Sonnet 카드 → [만들기].
async function liveBasic(fx: Fixture) {
  const { userId, ev } = fx;
  await resetSegment(userId, null);
  const t0 = new Date();
  const st = await startFreeTopic(userId, { eventId: ev.HIGH_SCHOOL, kind: "episode" }, SESSION);
  check("⑤ 실제 — 주제 시작(고등학교)", st.kind === "opening");
  const r1 = await say(userId, "고등학교 2학년 때 수학여행으로 경주 불국사에 갔어요. 박영수랑 같은 방을 썼지요.");
  const r2 = await say(userId, "밤새 이야기하다가 선생님한테 혼났어요. 그게 다예요.");
  check("⑤ 실제 — 응답(Haiku) 2회 · 두 번째 턴 뒤 제안(마무리 말)", r1.kind === "reply" && r2.kind === "reply" && !!r2.propose, { r1, r2 });
  const p = await proposeFromSegment(userId, { until: r2.kind === "reply" ? r2.propose?.until ?? null : null });
  const card = p.kind === "card" ? p.view.card : null;
  check("⑤ 실제 — 카드(Sonnet): 시기 = 고등학교 입학 · 박영수 = 이미 계신 분 · 경주 불국사",
    !!card && "id" in card.center && card.center.id === ev.HIGH_SCHOOL && card.people.some((x) => x.personId === fx.friendId) && card.places.some((x) => x.name.includes("불국사")) && card.summary.length > 10,
    card);
  const made = await createFromFreeChatProposal(userId);
  check("⑤ 실제 — [만들기] 저장 · 확인 대기 0", made.ok && JSON.stringify(await draftsAndProposed(userId)) === JSON.stringify({ drafts: 0, proposed: 0 }), made);
  const u = await usageSince(userId, t0);
  check("⑤ 원가 원장 — 응답 2(Haiku) + 제안 ≥1(Sonnet)", u.reply.calls === 2 && (u.reply.model ?? "").includes("haiku") && u.proposal.calls >= 1 && (u.proposal.model ?? "").includes("sonnet"), u);
  console.log("   이야기 1편 원가:", JSON.stringify(u));
}

async function liveScenarios(fx: Fixture) {
  const { userId, ev } = fx;

  // A. 일단락 판단 — 마무리 말 없이, AI 가 done 이라 판단해 제안하는지.
  await resetSegment(userId, null);
  const tA = new Date();
  const a: FreeChatReplyResult[] = [];
  for (const line of [
    "군대 갔을 때 이야기 하나 할게요. 논산 훈련소에서 첫날 밤에 잠이 하나도 안 왔어요.",
    "집 생각이 많이 났지요. 어머니가 싸 주신 미숫가루를 동기들이랑 나눠 먹었어요.",
    "그래도 그 동기들 덕분에 버텼어요. 지금 생각해도 고마운 사람들이에요.",
    "네, 그날 일은 그렇게 지나갔어요. 이제 생각하면 웃음이 나요.",
  ]) {
    const r = await say(userId, line);
    a.push(r);
    if (r.kind === "reply" && r.propose) break;
  }
  const aLast = a[a.length - 1];
  const aTurns = a.length;
  const aProposed = aLast?.kind === "reply" && !!aLast.propose;
  console.log(`   A 일단락: ${aTurns}턴 만에 제안=${aProposed}`, JSON.stringify(a.map((r) => (r.kind === "reply" ? r.reply : r.kind))));
  check("A 실제 — AI 일단락 판단으로 제안(마무리 말 없이, 6턴 전)", aProposed && aTurns < 6, a);
  if (aProposed) {
    const p = await proposeFromSegment(userId, { until: aLast.kind === "reply" ? aLast.propose?.until ?? null : null });
    const card = p.kind === "card" ? p.view.card : null;
    check("A 실제 — 카드 시기 = 군 입대", !!card && "id" in card.center && card.center.id === ev.MILITARY, card);
    const made = await createFromFreeChatProposal(userId);
    check("A 실제 — [만들기]", made.ok, made);
    console.log("   A 원가:", JSON.stringify(await usageSince(userId, tA)));
  }

  // B. 6턴 강제 — 짧은 답이 이어져도 본인 6턴째 응답 뒤 제안.
  await resetSegment(userId, ev.FIRST_JOB);
  const b: FreeChatReplyResult[] = [];
  for (const line of [
    "첫 직장은 부산 국제시장 옆 신발 공장이었어요.",
    "아침 일곱 시까지 출근했어요.",
    "점심은 공장 식당에서 국수를 먹었지요.",
    "월급날이면 동료들이랑 돼지국밥을 먹으러 갔어요.",
    "공장장님이 엄하셨는데 정이 많은 분이었어요.",
    "겨울엔 손이 많이 시렸어요.",
  ]) {
    const r = await say(userId, line);
    b.push(r);
    if (r.kind === "reply" && r.propose) break;
  }
  const bLast = b[b.length - 1];
  console.log(`   B 6턴: ${b.length}턴 만에 제안=${bLast?.kind === "reply" && !!bLast.propose}`);
  check("B 실제 — 6턴 이내 제안(6턴이면 반드시)", bLast?.kind === "reply" && !!bLast.propose && b.length <= 6, b.map((r) => (r.kind === "reply" ? r.propose : r.kind)));
  // B 는 [고치기] 후 [만들기] — 제목·시기(새 시기)·사람 추가·장소 빼기.
  const pB = await proposeFromSegment(userId, { until: bLast?.kind === "reply" ? bLast.propose?.until ?? null : null });
  if (pB.kind === "card") {
    const edit: CardEdit = {
      ...cardToEdit({ ...pB.view.card, transcript: "" }),
      title: "[fixture] 신발 공장 시절",
      center: { new: { label: "신발 공장", year: 1976 } },
      people: [...cardToEdit({ ...pB.view.card, transcript: "" }).people, { name: "정공장", relation: "공장장님", personId: null }],
      places: [],
    };
    const madeB = await createFromFreeChatProposal(userId, edit);
    const epB = madeB.ok ? await prisma.episode.findUnique({ where: { id: madeB.episodeId }, include: { memory: { select: { title: true } }, lifeEvent: { select: { label: true, year: true, type: true } } } }) : null;
    const mpB = epB ? await prisma.memoryPlace.count({ where: { memoryId: epB.memoryId } }) : -1;
    check("C 실제 — [고치기] 후 [만들기]: 고친 제목·새 시기(신발 공장 1976)·추가한 사람·장소 0",
      madeB.ok && epB?.memory.title === "[fixture] 신발 공장 시절" && epB.lifeEvent.label === "신발 공장" && epB.lifeEvent.type === "CUSTOM" && epB.lifeEvent.year === 1976 && mpB === 0 &&
        (await prisma.person.count({ where: { userId, name: "정공장", isDraft: false } })) === 1,
      { madeB, epB: epB && { title: epB.memory.title, center: epB.lifeEvent }, mpB });
  } else check("B 실제 — 카드", false, pB);

  // D. 안 만들기 후 대화 계속 — 앞 이야기는 다시 제안되지 않고, 다음 이야기만 다음 카드로.
  await resetSegment(userId, null);
  await say(userId, "국민학교 때 운동회에서 달리기 일등을 했어요.");
  const d2 = await say(userId, "공책 세 권을 상으로 받았는데 그게 다예요.");
  const pD = await proposeFromSegment(userId, { until: d2.kind === "reply" ? d2.propose?.until ?? null : null });
  const epsBeforeDecline = await prisma.episode.count({ where: { lifeEvent: { userId } } });
  const decD = pD.kind === "card" ? await declineFreeChatProposal(userId) : null;
  check("D 실제 — 카드 → [안 만들기] 저장 0", pD.kind === "card" && !!decD && (await prisma.episode.count({ where: { lifeEvent: { userId } } })) === epsBeforeDecline, pD.kind);
  const d3 = await say(userId, "그리고 중학교 때는 형편이 어려워서 신문 배달을 했어요.");
  const d4 = await say(userId, "새벽 네 시에 일어나야 했지요. 그 정도예요.");
  const pD2 = await proposeFromSegment(userId, { until: d4.kind === "reply" ? d4.propose?.until ?? null : null });
  const sumD2 = pD2.kind === "card" ? pD2.view.card.summary : "";
  check("D 실제 — 계속한 대화로 다음 카드 · 안 만든 이야기(운동회)는 다시 안 나옴",
    d3.kind === "reply" && pD2.kind === "card" && sumD2.includes("신문") && !sumD2.includes("운동회") && !sumD2.includes("달리기"),
    { d3: d3.kind === "reply" ? d3.reply : d3.kind, sumD2 });
  if (pD2.kind === "card") await declineFreeChatProposal(userId);

  // E. 동명이인 — 확정 정다운(외삼촌)이 있는데 친구 정다운 이야기.
  await resetSegment(userId, null);
  await say(userId, "스무 살 때 동네 친구 정다운이랑 서울로 올라왔어요. 둘이 같이 자취를 했지요.");
  const e2 = await say(userId, "서울역에 내렸을 때 사람이 정말 많았어요. 그게 다예요.");
  const pE = await proposeFromSegment(userId, { until: e2.kind === "reply" ? e2.propose?.until ?? null : null });
  const minsu = pE.kind === "card" ? pE.view.card.people.find((x) => x.name === "정다운") : undefined;
  check("E 실제 — 카드의 정다운 = 새 이름 + 같은 이름 확정 인물 되묻기(외삼촌)",
    !!minsu && minsu.personId === null && minsu.sameName.some((s) => s.id === fx.uncleId),
    pE.kind === "card" ? pE.view.card.people : pE);
  if (pE.kind === "card") {
    const asked = await createFromFreeChatProposal(userId);
    check("E 실제 — 답 없이 [만들기] → 되묻기(저장 0)", !asked.ok && asked.reason === "ask", asked);
    const idx = pE.view.card.people.findIndex((x) => x.name === "정다운");
    const edit = cardToEdit({ ...pE.view.card, transcript: "" });
    edit.people[idx] = { ...edit.people[idx], decision: "different" };
    const madeE = await createFromFreeChatProposal(userId, edit);
    check("E 실제 — [다른 분이에요] → 새 정다운(확정) 2명째", madeE.ok && (await prisma.person.count({ where: { userId, name: "정다운", isDraft: false } })) === 2, madeE);
  }
}

// ─── 운영 test30 E2E 후속(2026-11-01) — LLM 0 ────────────────────────────

async function e2eFollowupChecks(fx: Fixture) {
  const { userId, ev } = fx;

  // 1 — 앱 안내문은 구간 대화가 아니다(저장한 이야기 제목이 다음 제안에 섞이던 원인).
  check("⑨-1 앱 안내문 판정 — 만든 뒤·안 만들기·인사 = 안내문 / 본인 말 같은 문장 = 아님",
    isAppNotice(FREE_CHAT_COPY.created("방학마다 외할머니 댁 개울에서 물고기 잡기")) && isAppNotice(FREE_CHAT_COPY.declined) &&
      isAppNotice(FREE_CHAT_COPY.greeting) && !isAppNotice("그 이야기를 My Life 에 남겼어요 하고 웃었어요") && !isAppNotice("네 맛있었어요"));
  const msg = buildProposalUserMessage({ centers: [], people: [], topic: null, birthYear: 1958, transcript: "[본인] x", alreadySaved: [{ title: "개울 물고기", summary: "개울에서 물고기를 잡았다." }] });
  check("⑨-1 제안 입력에 [방금 남긴 이야기 — 다시 쓰지 마세요] 제목·본문", msg.includes("[방금 남긴 이야기 — 다시 쓰지 마세요]\n- 개울 물고기: 개울에서 물고기를 잡았다."));

  // [만들기] 직후 — 구간 = 그 뒤 턴만, 안내문만 있으면 실질 0 · 제안 호출 0. 다음 기본 시기 = 방금 만든 이야기의 시기.
  await prisma.chatV3Segment.update({ where: { userId }, data: { startedAt: new Date(), proposal: Prisma.DbNull, topicEventId: null, topicGapType: null, topicPersonId: null } });
  await sleep(5);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "중학교 때 소풍을 갔어요. 김밥을 싸 갔지요." } });
  await sleep(5);
  const until = new Date();
  await sleep(5);
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { proposal: baseCard({ title: "[fixture] 소풍", summary: "중학교 때 소풍을 갔다.", center: { id: ev.HIGH_SCHOOL, label: "고등학교 입학", year: 1968 }, until: until.toISOString() }) as unknown as Prisma.InputJsonValue },
  });
  const made = await createFromFreeChatProposal(userId);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.created("[fixture] 소풍") } });
  await sleep(5);
  const usage0 = await prisma.chatV3Usage.count({ where: { userId } });
  const st = await getFreeChatState(userId);
  const none = await proposeFromSegment(userId);
  const segAfter = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("⑨-1 [만들기] 직후 구간 = 그 뒤 턴만 — 안내문만 있으면 실질 0 · 카드 없음 · 모델 호출 0",
    made.ok && st.segmentTurns === 0 && none.kind === "none" && (await prisma.chatV3Usage.count({ where: { userId } })) === usage0, { st, none });
  check("⑨-3 [만들기] 뒤 다음 구간 기본 시기 = 방금 만든 이야기의 시기(carry) · /story-review 진행 중 아님",
    made.ok && segAfter.topicEventId === made.eventId && segAfter.topicGapType === "carry" && (await getFreeChatTopic(userId)) === null, segAfter);

  // [안 만들기] — 안 만든 이야기는 다시 제안하지 않고(구간을 카드 뒤로), 직전에 만든 이야기의 시기 힌트는 그대로.
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "소풍 가서 보물찾기를 했어요." } });
  await sleep(5);
  const until2 = new Date();
  await sleep(5);
  await prisma.chatV3Segment.update({ where: { userId }, data: { proposal: baseCard({ title: "[fixture] 보물찾기", until: until2.toISOString() }) as unknown as Prisma.InputJsonValue } });
  const dec = await declineFreeChatProposal(userId);
  const segDec = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("⑨-1 [안 만들기] = 그 내용 다시 제안 안 함(구간 0턴) · 시기 힌트(carry) 유지",
    dec.segmentTurns === 0 && segDec.startedAt.getTime() === until2.getTime() && segDec.topicGapType === "carry" && segDec.topicEventId === (made.ok ? made.eventId : ""), { dec, segDec });
  const topicStart = await startFreeTopic(userId, { eventId: ev.MILITARY, kind: "episode" }, SESSION);
  const segTopic = await prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  check("⑨-3 갭 칩·딥링크 주제가 시기 힌트보다 우선", topicStart.kind === "opening" && segTopic.topicGapType === "episode" && segTopic.topicEventId === ev.MILITARY);

  // 2 — 제목: 지도·목록 글자 = 제목 칸 그대로, 비었으면 본문 첫 문장(displayTitle). 2026-11-02 "시기 이름이면 제목으로
  // 안 봄" 조건 제거 — 옛 제목(시기 이름)은 db/cleanup-legacy-story-titles.ts 가 빈 문자열로 비웠다(실고객 0편).
  const cleared = await createEpisodeBridge(userId, ev.HIGH_SCHOOL, "", 1968, "고등학교 강당에서 졸업식을 했다. 눈이 왔다.", "[본인] 졸업식");
  const periodNamed = await createEpisodeBridge(userId, ev.HIGH_SCHOOL, "고등학교 입학", 1968, "교복을 처음 입었다.", "[본인] 교복");
  const data = await getMyLifeData(userId);
  const all = data.events.flatMap((e) => e.stories);
  const titled = all.find((x) => made.ok && x.id === made.episodeId);
  const old = all.find((x) => x.id === cleared?.episodeId);
  const named = all.find((x) => x.id === periodNamed?.episodeId);
  check("⑨-2 지도·목록 글자 — 제목 있는 이야기 = 제목 / 제목을 비운 옛 이야기 = 본문 첫 문장 / 시기 이름도 제목 칸에 있으면 그대로(조건 제거)",
    titled?.title === "[fixture] 소풍" && !!titled && displayTitle(titled) === "[fixture] 소풍" &&
      old?.title === "" && !!old && displayTitle(old) === "고등학교 강당에서 졸업식을 했다." &&
      !!named && displayTitle(named) === "고등학교 입학",
    { titled: titled && { title: titled.title, text: displayTitle(titled) }, old: old && { title: old.title, text: displayTitle(old) }, named: named && displayTitle(named) });
  check("⑨-2 \"시기 이름이면 제목으로 안 봄\" 조건 제거 — lib/my-life 에 storyTitleOf·시기 이름 판정 없음",
    !/storyTitleOf|isPeriodNameTitle/.test(read("lib/my-life.ts")));
  const found = searchMyLife(data, "소풍").find((r) => made.ok && r.key.endsWith(made.episodeId));
  check("⑨-2 찾기 — 제목으로 찾고 결과 이름 = 제목", found?.title === "[fixture] 소풍" && found.rank === 0, found);

  // 3 — 새 시기는 인생 단계만(프롬프트 규칙 — 판단은 모델, 낱말 목록 보정은 test-p23 원양어선을 잘못 옮겨 뺐다).
  // 실제 출력: --live F(놀이 이야기 → 기존 시기 유지) + test-p23(스물다섯 원양어선 = 새 시기).
  check("⑨-3 새 시기 규칙 — 인생 단계 자체일 때만, 놀이·여행·방학·사건·사람 이야기는 기존 시기",
    PROPOSAL_SYSTEM_PROMPT.includes("new(새 시기)는 이야기가 인생 단계 자체일 때만") && PROPOSAL_SYSTEM_PROMPT.includes("놀이·여행·방학·사건·사람 이야기는 새 시기가 아닙니다"));

  // 4·5 — 프롬프트 규칙(실제 출력은 --live E2E 재현에서).
  check("⑨-4 장소 규칙 — 이름 없는 곳(관계·모양으로 말한 곳)도 장소, 가리키기만 하는 말만 뺌",
    PROPOSAL_SYSTEM_PROMPT.includes("이름 없이 관계·모양으로 말한 곳도 장소입니다") && PROPOSAL_SYSTEM_PROMPT.includes('"거기", "그곳"') && !PROPOSAL_SYSTEM_PROMPT.includes('"집", "거기", "학교"처럼 막연한 말은 빼세요'));
  const replyPrompt = buildFreeChatReplySystemPrompt({ birthYear: 1958, topic: null, recentTitles: [] });
  check("⑨-5 일단락 답 규칙 — 대화를 이어 가는 말, 작별·마무리 인사 금지(예시에도 없음)",
    replyPrompt.includes("작별·마무리 인사로 끝내지 마세요") && !/당신: \{"reply": "[^"]*(들려주셔서 고마워요|잘 들었어요)/.test(replyPrompt));
}

// ─── 장소 이름 합쳐짐 되묻기 + 프롬프트 예시 소재(2026-11-02) — LLM 0 ──────────

// 프롬프트 예시에 쓰면 안 되는 소재 — 운영 test30 E2E 대화(=F 재현 문장)와 이 흐름 회귀의 픽스처 문장.
// 모델이 예시를 그대로 베낀 전례 2회(말투 예시·작별 인사 예시), 예시가 재현 문장과 같으면 F 통과도 믿을 수 없다.
const FIXTURE_WORDS = [
  "외할머니", "개울", "물고기", "감자전", "정우", "발 담그",
  "운동회", "수학여행", "불국사", "해운대", "신문 배달", "논산", "미숫가루", "신발 공장", "돼지국밥",
  "정다운", "서울역", "김민수", "박영수", "외삼촌", "담임 선생님", "서울 상경", "졸업식", "소풍", "보물찾기",
  "셋방", "운동장", "스무 살",
];

async function placeMergeChecks(fx: Fixture) {
  const { userId, ev, teacherId } = fx;
  const halmeoni = await prisma.place.create({ data: { userId, name: "외할머니 댁" }, select: { id: true } });
  const stream = await prisma.place.create({ data: { userId, name: "개울" }, select: { id: true } });
  await prisma.place.create({ data: { userId, name: "집" } });
  const placesNow = () => prisma.place.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const rows = await placesNow();
  const merged = placeRow(rows, "외할머니 댁 개울");
  check("⑩ 새 장소 이름이 기존 장소 둘을 이어 붙임 → 새 이름 + 되묻기 후보 2(외할머니 댁·개울)",
    merged.placeId === null && merged.overlap?.map((o) => o.id).join() === [halmeoni.id, stream.id].join(), merged);
  check("⑩ 기존 장소 하나를 품음 → 후보 1 / 같은 이름(공백 무시) → 이미 있는 곳 / 한 글자 이름(집)은 후보 아님 / 겹침 없음 → 새로",
    overlappingPlaces(rows, "개울가 바위").map((o) => o.id).join() === stream.id && placeRow(rows, "외할머니댁").placeId === halmeoni.id &&
      placeRow(rows, "우리 집 마당").overlap?.length === 0 && placeRow(rows, "강릉 경포대").placeId === null && placeRow(rows, "강릉 경포대").overlap?.length === 0);

  const counts = async () => ({
    episodes: await prisma.episode.count({ where: { lifeEvent: { userId } } }),
    people: await prisma.person.count({ where: { userId } }),
    places: await prisma.place.count({ where: { userId } }),
  });
  const card = baseCard({
    title: "[fixture] 개울 이야기",
    center: { id: ev.ELEM_SCHOOL, label: "국민학교 입학", year: 1959 },
    people: [{ name: "김민수", relation: "친구", personId: null, sameName: [{ id: teacherId, name: "김민수", relation: "담임 선생님" }] }],
    places: [{ name: "외할머니 댁 개울", placeId: null, overlap: merged.overlap }],
  });
  check("⑩ 카드 → 고칠 값(cardToEdit)에 되묻기 후보 칸은 안 옮김", !("overlap" in cardToEdit(card).places[0]));
  const before = await counts();
  const asked = await createFromCard(userId, card, cardToEdit(card));
  check("⑩ [만들기] — 사람·장소 되묻기를 한 번에(사람 행 0 · 장소 행 0 후보 2), 아무것도 저장 안 함",
    !asked.ok && asked.reason === "ask" && asked.ask[0]?.index === 0 && asked.placeAsk[0]?.index === 0 && asked.placeAsk[0].candidates.length === 2 &&
      JSON.stringify(await counts()) === JSON.stringify(before),
    asked);
  const oldCard = baseCard({ ...card, people: [], places: [{ name: "외할머니 댁 개울", placeId: null }] });
  const askedOld = await createFromCard(userId, oldCard, cardToEdit(oldCard));
  check("⑩ 되묻기 후보 칸 없는 옛 카드도 되묻기(저장 쪽이 다시 계산)", !askedOld.ok && askedOld.reason === "ask" && askedOld.placeAsk.length === 1 && askedOld.ask.length === 0, askedOld);
  const wrong = await createFromCard(userId, oldCard, { ...cardToEdit(oldCard), places: [{ name: "외할머니 댁 개울", placeId: null, decision: "same", samePlaceId: fx.placeId }] });
  check("⑩ [같은 곳이에요] 후보 밖 장소 id → 거부(저장 0)", !wrong.ok && wrong.reason === "invalid" && JSON.stringify(await counts()) === JSON.stringify(before), wrong);

  const same = await createFromCard(userId, oldCard, {
    ...cardToEdit(oldCard),
    places: [{ name: "외할머니 댁 개울", placeId: null, decision: "same", samePlaceId: stream.id }, { name: "개울", placeId: null }],
  });
  const sameEp = same.ok ? await prisma.episode.findUnique({ where: { id: same.episodeId }, select: { memoryId: true } }) : null;
  const sameMp = sameEp ? await prisma.memoryPlace.findMany({ where: { memoryId: sameEp.memoryId }, select: { placeId: true } }) : [];
  check("⑩ [같은 곳이에요] → 기존 개울에 연결 · 새 장소 0 · 같은 곳을 가리킨 두 줄은 한 번만",
    same.ok && same.created.places === 1 && sameMp.length === 1 && sameMp[0].placeId === stream.id && (await counts()).places === before.places, { same, sameMp });

  const sep = await createFromCard(userId, oldCard, { ...cardToEdit(oldCard), title: "[fixture] 따로", places: [{ name: "외할머니 댁 개울", placeId: null, decision: "separate" }] });
  check("⑩ [따로 만들기] → 그 이름으로 새 장소 1",
    sep.ok && sep.created.places === 1 && (await prisma.place.count({ where: { userId, name: "외할머니 댁 개울" } })) === 1 && (await counts()).places === before.places + 1, sep);
  check("⑩ 따로 만든 뒤 같은 이름 = 이미 있는 곳(다시 묻지 않음)", placeRow(await placesNow(), "외할머니 댁 개울").placeId !== null);

  // 프롬프트 — 장소 하나에 이름 하나 + 예시 소재가 픽스처·재현 대화와 겹치지 않음.
  check("⑩ 장소 규칙 — 장소 하나에 이름 하나(두 곳이면 두 개, 이어 붙이지 않음)", PROPOSAL_SYSTEM_PROMPT.includes("장소 하나에 이름 하나 — 두 곳이면 두 개로 나눠 쓰고"));
  // 요약 규칙(이야기 저장 요약 프롬프트와 공유하는 부분)은 빼고 이 흐름 프롬프트만 본다.
  const proposalOwn = PROPOSAL_SYSTEM_PROMPT.replace(/summary\(본문\) 작성 규칙:[\s\S]*?\n\ncenter\(/, "center(");
  const replyOwn = buildFreeChatReplySystemPrompt({ birthYear: null, topic: null, recentTitles: [] });
  const hits = FIXTURE_WORDS.filter((w) => proposalOwn.includes(w) || replyOwn.includes(w));
  check("⑩ 프롬프트 예시 소재 — 재현 대화·픽스처 낱말 0(응답·제안 프롬프트)", hits.length === 0 && proposalOwn.length < PROPOSAL_SYSTEM_PROMPT.length, hits);
}

// ─── 제목 없음(빈 문자열) — 공용 판정·[고치기]·읽는 곳(2026-11-02) — LLM 0 ───────

async function titleChecks(fx: Fixture) {
  const { userId, ev } = fx;
  check("⑪ 제목 판정 한 곳(displayTitle) — 제목 있으면 제목(앞뒤 공백 정리) / 빈 값·공백뿐·null = 본문 첫 문장",
    displayTitle({ title: "  연 날리기 ", content: "x." }) === "연 날리기" && displayTitle({ title: "", content: "첫 문장이다. 둘째." }) === "첫 문장이다." &&
      displayTitle({ title: "   ", content: "첫 문장이다. 둘째." }) === "첫 문장이다." && displayTitle({ title: null, content: " 마침표 없음 " }) === "마침표 없음");

  // [고치기]에서 제목을 지우고 [만들기] → 빈 문자열 = 제목 없음(전에는 "제목과 내용이 필요해요"로 거부).
  const lead = "앞마당에서 연을 날렸다.";
  const card = baseCard({ title: "[fixture] 지울 제목", summary: `${lead} 바람이 셌다.`, center: { id: ev.ELEM_SCHOOL, label: "국민학교 입학", year: 1959 } });
  const made = await createFromCard(userId, card, { ...cardToEdit(card), title: "   " });
  const ep = made.ok ? await prisma.episode.findUnique({ where: { id: made.episodeId }, select: { memory: { select: { title: true } } } }) : null;
  const story = made.ok ? (await getMyLifeData(userId)).events.flatMap((e) => e.stories).find((x) => x.id === made.episodeId) : undefined;
  check("⑪ [고치기]에서 제목을 지움 → 저장 = 빈 문자열 · 지도 제목 없음 · 지도 글자·결과 제목 = 본문 첫 문장",
    made.ok && ep?.memory.title === "" && story?.title === "" && !!story && displayTitle(story) === lead && made.title === lead, { made, ep, story });

  // 읽는 곳 — /story-review 이름 · 포스터 구간 행 제목 · 방금 남긴 이야기(화면 제목으로 찾음).
  const period = await createEpisodeBridge(userId, ev.MILITARY, "", 1973, "훈련소에서 첫 편지를 썼다. 손이 떨렸다.", "[본인] 편지", undefined, true);
  const review = await getStoryReviewData(userId);
  const label = review.episodes.find((e) => made.ok && e.id === made.episodeId)?.label;
  const rows = await syncV3Bridge(userId);
  const posterRow = rows.find((r) => !!period && r.id === periodMemoryId(period.episodeId));
  const saved = await recentSavedStories(userId, [lead]);
  check("⑪ 제목 없는 이야기 — /story-review 이름 · 포스터 구간 행 제목 = 본문 첫 문장 · 방금 남긴 이야기로 찾음",
    label === lead && posterRow?.title === "훈련소에서 첫 편지를 썼다." && saved.length === 1 && saved[0].title === lead && saved[0].summary === card.summary,
    { label, posterRow, saved });

  // 이야기 제목(브릿지 메모리 title)을 읽는 서버 코드 — 전부 displayTitle 을 거친다(주석 제외). 화면도 displayTitle.
  const code = (rel: string) => read(rel).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const servers = ["lib/story-review.ts", "lib/node-confirm.ts", "lib/poster/v3-bridge.ts", "lib/interview/session.ts", "lib/free-chat.ts"];
  const rawReads = servers.filter((rel) => {
    const c = code(rel);
    return (c.match(/memory\??\.title/g) ?? []).length !== (c.match(/displayTitle\(\{ title: \w+\.memory\.title/g) ?? []).length;
  });
  const screens = ["lib/my-life-search.ts", "app/my-life/MyLifeView.tsx", "app/components/ProposalCard.tsx"].filter((rel) => !code(rel).includes("displayTitle("));
  check("⑪ 제목 읽는 곳 = displayTitle(서버 5곳 · 지도·목록·패널·찾기·카드)", rawReads.length === 0 && screens.length === 0 && !code("app/my-life/MyLifeView.tsx").includes("storyText"), { rawReads, screens });
}

const FAREWELL = /(들려주셔서|고마워요|고맙습니다|감사|잘 들었|즐거웠|다음에 또|안녕히)/;

// 운영 test30 E2E 같은 문장 재현(실제 Haiku·Sonnet) — 두 번째 제안에 첫 이야기 미포함·중학교 시기 유지·장소 추출·작별 인사 없음·제목 표시.
async function liveE2EReplay() {
  const EMAIL = "fixture-chat-e2e@lifebook.invalid";
  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const now = new Date();
  const userId = (
    await prisma.user.create({
      data: {
        email: EMAIL, name: "[fixture] chat e2e", birthYear: 1958, onboardingTrack: "V3",
        termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION,
      },
      select: { id: true },
    })
  ).id;
  try {
    await prisma.onboardingProfile.create({ data: { userId, birthYear: 1958, region: "서울", skeletonGeneratedAt: now } });
    const rows: [LifeEventType, string, number | null][] = [
      ["BIRTH", "출생", 1958], ["ELEM_SCHOOL", "국민학교 입학", 1965], ["MIDDLE_SCHOOL", "중학교 입학", 1971], ["HIGH_SCHOOL", "고등학교 입학", 1974],
      ["UNIVERSITY", "대학교 입학", 1977], ["MILITARY", "군 입대", 1978], ["FIRST_JOB", "첫 직장", null], ["MARRIAGE", "결혼", null],
    ];
    const ev: Record<string, string> = {};
    for (const [i, [type, label, year]] of rows.entries()) {
      ev[type] = (await prisma.lifeEvent.create({ data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: now, sequenceOrder: i, personAsked: true }, select: { id: true } })).id;
    }
    await getFreeChatState(userId); // 자유 대화 진입
    await sleep(5);
    const say1 = async (text: string) => say(userId, text);

    // 첫 이야기(같은 문장)
    let r: FreeChatReplyResult | null = null;
    for (const line of ["중학교 때 방학마다 외할머니 댁에 가서 개울에서 물고기를 잡았어요", "사촌 동생 정우랑 같이 갔어요", "저녁엔 할머니가 해주신 감자전을 먹었어요", "네 맛있었어요"]) {
      r = await say1(line);
    }
    const firstReply = r?.kind === "reply" ? r : null;
    console.log("   E2E 4턴째 응답:", firstReply?.reply, "/ 제안:", JSON.stringify(firstReply?.propose));
    // 제안 시점(일단락 판단)은 모델 판단이라 4턴째가 아닐 수 있다 — 카드는 아래에서 바로 만들고, 제안이 뜬 턴의 답만 본다.
    if (firstReply?.propose) check("F 실제 — 카드를 띄운 턴(4턴째) 답이 작별·마무리 인사 아님(5)", !FAREWELL.test(firstReply.reply), firstReply.reply);
    const p1 = await proposeFromSegment(userId, { until: firstReply?.propose?.until ?? null });
    const c1 = p1.kind === "card" ? p1.view.card : null;
    console.log("   카드1:", JSON.stringify(c1 && { title: c1.title, center: c1.center, people: c1.people.map((x) => x.name), places: c1.places.map((x) => x.name), summary: c1.summary }));
    check("F 실제 — 카드1 시기 = 중학교 입학 · 사람 정우 · 장소에 외할머니 댁·개울(4)",
      !!c1 && "id" in c1.center && c1.center.id === ev.MIDDLE_SCHOOL && c1.people.some((x) => x.name.includes("정우")) &&
        c1.places.some((x) => x.name.includes("외할머니")) && c1.places.some((x) => x.name.includes("개울")),
      c1 && { center: c1.center, people: c1.people, places: c1.places });
    check("F 실제 — 카드1 장소 = 장소 하나에 이름 하나(외할머니 댁·개울을 이어 붙인 이름 없음)",
      !!c1 && !c1.places.some((x) => x.name.includes("외할머니") && x.name.includes("개울")), c1?.places);
    // E2E 처럼 제목을 고쳐서 [만들기] → 대화창에 "남겼어요" 안내(화면과 같이 로그에 남김).
    const title = "방학마다 외할머니 댁 개울에서 물고기 잡기";
    const made = c1 ? await createFromFreeChatProposal(userId, { ...cardToEdit({ ...c1, transcript: "" }), title }) : null;
    if (made?.ok) {
      await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.created(made.title) } });
      await sleep(5);
    }
    const map = await getMyLifeData(userId);
    const story = map.events.flatMap((e) => e.stories).find((x) => made?.ok && x.id === made.episodeId);
    check("F 실제 — 고친 제목이 My Life 지도·목록 글자(2)", !!story && displayTitle(story) === title, story && { title: story.title, text: displayTitle(story) });

    // 두 번째 구간(같은 문장) — 첫 이야기 미포함·중학교 시기 유지(1·3).
    let r2: FreeChatReplyResult | null = null;
    for (const line of ["그날 개울물이 엄청 차가웠어요", "네 발 담그고 놀았어요"]) r2 = await say1(line);
    const second = r2?.kind === "reply" ? r2 : null;
    console.log("   E2E 6턴째 응답:", second?.reply, "/ 제안:", JSON.stringify(second?.propose));
    const p2 = await proposeFromSegment(userId, { until: second?.propose?.until ?? null });
    const c2 = p2.kind === "card" ? p2.view.card : null;
    console.log("   카드2:", JSON.stringify(c2 && { title: c2.title, center: c2.center, summary: c2.summary, people: c2.people.map((x) => x.name), places: c2.places.map((x) => ({ name: x.name, existing: !!x.placeId, ask: x.overlap?.map((o) => o.name) ?? [] })) }));
    // 카드1로 만든 장소(외할머니 댁·개울) — 카드2 새 장소 이름이 이걸 품으면 되묻기 후보가 붙어야 한다.
    const owned = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true } });
    const mergedRows = (c2?.places ?? []).filter((x) => !x.placeId && overlappingPlaces(owned, x.name).length > 0);
    check("F 실제 — 카드2: 기존 장소 이름을 품은 새 장소 이름이면 되묻기 후보가 붙음",
      !!c2 && mergedRows.every((x) => (x.overlap?.length ?? 0) > 0), { mergedRows, places: c2?.places });
    if (c2 && mergedRows.length > 0) {
      const eps = await prisma.episode.count({ where: { lifeEvent: { userId } } });
      const asked = await createFromFreeChatProposal(userId);
      check("F 실제 — 카드2 합쳐진 장소 이름 → [만들기] 되묻기(저장 0)",
        !asked.ok && asked.reason === "ask" && asked.placeAsk.length === mergedRows.length && (await prisma.episode.count({ where: { lifeEvent: { userId } } })) === eps, asked);
    }
    console.log(`   카드2 합쳐진 장소 이름: ${mergedRows.length}개`);
    check("F 실제 — 두 번째 카드: 첫 이야기 내용(감자전·정우·방학) 없음 · 새로 한 말(차가운 개울물·발) 있음(1)",
      !!c2 && !/(감자전|정우|방학)/.test(c2.summary) && /(차가|차갑)/.test(c2.summary) && /발/.test(c2.summary), c2?.summary);
    check("F 실제 — 두 번째 카드 시기 = 중학교 입학 유지(3)", !!c2 && "id" in c2.center && c2.center.id === ev.MIDDLE_SCHOOL, c2?.center);
    if (second?.propose) check("F 실제 — 두 번째 제안 턴 응답도 작별 인사 아님(5)", !FAREWELL.test(second.reply), second.reply);
    // [안 만들기] 뒤 대화 계속 — 안 만든 내용은 구간에서 빠짐.
    if (c2) await declineFreeChatProposal(userId);
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.declined } });
    await sleep(5);
    const r3 = await say1("정우가 물고기를 더 많이 잡았어요");
    check("F 실제 — [안 만들기] 뒤 계속: 새 구간 실질 1턴(안 만든 두 턴·안내문 제외)", r3.kind === "reply" && r3.segmentTurns === 1, r3);
    const u = await usageSince(userId, new Date(0));
    console.log("   E2E 재현 원가:", JSON.stringify(u));
  } finally {
    await deleteAccountTx(userId);
    const left = await Promise.all([
      prisma.user.count({ where: { email: EMAIL } }),
      prisma.lifeEvent.count({ where: { userId } }),
      prisma.onboardingChatMessage.count({ where: { userId } }),
    ]);
    check("F 정리 — E2E 픽스처 계정·시기·대화 로그 0", left.every((n) => n === 0), left);
  }
}

async function main() {
  pureChecks();
  staticChecks();
  await removeFixture();
  let fx: Fixture | null = null;
  try {
    fx = await seedFixture();
    await prisma.chatV3Segment.create({ data: { userId: fx.userId } });
    await cardChecks(fx);
    await segmentChecks(fx);
    fallbackOutputChecks();
    await fallbackCountChecks(fx);
    await e2eFollowupChecks(fx);
    await placeMergeChecks(fx);
    await titleChecks(fx);
    await liveBasic(fx);
    if (LIVE) await liveScenarios(fx);
    if (LIVE) await liveE2EReplay();
    const total = await usageSince(fx.userId, new Date(0));
    console.log(`\n원가 합계(이 실행, 픽스처): 호출 ${total.calls} · $${total.usd.toFixed(4)}`);
  } finally {
    await removeFixture();
    const left = fx
      ? await Promise.all([
          prisma.user.count({ where: { email: FIXTURE_EMAIL } }),
          prisma.chatV3Segment.count({ where: { userId: fx.userId } }),
          prisma.lifeEvent.count({ where: { userId: fx.userId } }),
          prisma.person.count({ where: { userId: fx.userId } }),
          prisma.place.count({ where: { userId: fx.userId } }),
          prisma.onboardingChatMessage.count({ where: { userId: fx.userId } }),
        ])
      : [0];
    check("정리 — 픽스처 계정·구간·시기·사람·장소·대화 로그 0", left.every((n) => n === 0), left);
  }
  console.log(failed === 0 ? "\n전부 통과" : `\n실패 ${failed}건`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
