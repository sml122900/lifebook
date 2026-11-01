// My Life 개편 2단계 — /chat-v3 자유 대화 + "노드로 만들까요?" 제안 카드 회귀.
// docs/phase/my-life-restructure.md §3, §7.1 2단계 완료 기준.
//
// 실행: npx tsx db/test-chat-proposal.ts          (LLM 0 검사 + 실제 모델 1편 — Haiku 응답 + Sonnet 제안)
//       npx tsx db/test-chat-proposal.ts --live   (+ 실제 모델 시나리오: 일단락 판단 / 6턴 강제 / 안 만들기 후 계속 /
//                                                   고치기 후 만들기 / 동명이인 + 이야기 1편 원가)
// ⚠️ .env 가 운영 DB — 자기 픽스처 계정(fixture-chat-proposal@lifebook.invalid)만 만들고 끝에 지운다.
// 실고객·test30 접촉 0. 원가 원장(ChatV3Usage)은 실제 호출 원가라 남긴다(탈퇴처럼 userId 만 비워짐).

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { deleteAccountTx } from "../lib/account-deletion";
import { costMicroUsd, dayStartKst } from "../lib/chat-v3-usage";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import {
  adoptLegacyPending,
  createFromFreeChatProposal,
  declineFreeChatProposal,
  decideProposal,
  freeChatReply,
  getFreeChatState,
  parseReplyOutput,
  proposeFromSegment,
  replyResultFrom,
  startFreeTopic,
  substantiveUserTurns,
  type FreeChatReplyResult,
} from "../lib/free-chat";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { Prisma } from "../lib/generated/prisma/client";
import { cardToEdit, createFromCard, personRow, type CardEdit, type ProposalCard } from "../lib/node-proposal";

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
  const empty = await createFromCard(userId, card2, { ...cardToEdit(card2), title: "  ", people: [] });
  check("② 빈 제목 → 거부", !empty.ok && empty.reason === "invalid");
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
    await liveBasic(fx);
    if (LIVE) await liveScenarios(fx);
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
