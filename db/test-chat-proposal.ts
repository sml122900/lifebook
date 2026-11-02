// My Life 개편 2단계 — /chat-v3 자유 대화 + "노드로 만들까요?" 제안 카드 회귀.
// docs/phase/my-life-restructure.md §3, §7.1 2단계 완료 기준.
//
// 실행: npx tsx db/test-chat-proposal.ts          (LLM 0 검사 + 실제 모델 1편 — Haiku 응답 + Sonnet 제안)
//       npx tsx db/test-chat-proposal.ts --live   (+ 실제 모델 시나리오: 일단락 판단 / 6턴 강제 / 안 만들기 후 계속 /
//                                                   고치기 후 만들기 / 동명이인 + 이야기 1편 원가 /
//                                                   F 운영 test30 E2E 같은 문장 재현 — 별도 픽스처 fixture-chat-e2e@)
// ⑩(LLM 0) = 장소 이름 합쳐짐 되묻기 + 프롬프트 예시 소재가 픽스처·재현 대화와 겹치지 않는지.
// ⑪(LLM 0) = 제목 없음(빈 문자열) — 공용 판정 displayTitle·[고치기]에서 제목 지움·제목을 읽는 곳(서버는 실제 결과로).
// ⑫(LLM 0) = 시기 이름 제목 재발 방지 — 저장 한 곳(createEpisodeBridge) 규칙·userSetTitle 예외·저장 경로마다 실제 저장 제목.
// 호출 위치·개수를 세던 정적 검사는 2026-11-03 실제 결과 검사로 바꿈 — 화면 렌더가 필요한 것만 정적 확인(개수 대신 있는지·자리).
// ⑬(LLM 0) = 이름 뒤 조사 — 받침으로 고름(같은 곳·같은 분 되묻기), 문구 파일에 조사 하드코딩 0.
// ⑯(LLM 0) = 전역 하루 예산 — 테스트 계정(.invalid·.test) 사용분 제외(TEST_ 표시)·테스트 한도(CHAT_V3_TEST_BUDGET_USD).
// 실제 모델 항목 실패는 db/test-logs/live-failures/ 에 입출력, 시나리오 A 4턴 이내 제안 비율은 db/test-logs/live-stats.jsonl.
// ⑮(LLM 0) = 남은 구간 처리 — 6시간 넘은 구간 입장 때 닫음(짧으면 조용히·실질 내용은 카드부터)·주제 바뀜/다른 주제 + 짧으면 카드 없음(E2E 같은 문장·시각 조작).
// ⑭(LLM 0) = 긴 제목 표시 — 20자 안팎 어절 경계 줄임(저장 안내·지도 노드·목록)·카드 제목 2줄·머리말 scroll-padding.
// ⑱(LLM 0) = 이어지는 구간의 기존 장소·인물(2026-11-02 E2E 재검증) — "그 ○○"·줄인 이름은 기존 노드로(모델이 후보를 고르면 연결,
//   빠뜨리면 코드가 잡음 — 여럿이면 되묻기)·본인 가족 호칭·이름 · 재료 확인이 움직임 말(먹던·매운)로 제목을 비우지 않음.
//   --live H = 같은 문장 재현("학교 앞 분식집" 저장 → "그 분식집 떡볶이가 정말 매웠어요") · I = 어머니 다시 말함 → 이미 계신 분.
// ⑰(LLM 0) = 제안 재료 확인(2026-11-02) — 제목·장소는 이번 구간 본인 말에서만(저장한 이야기·앞 구간 낱말이면 제목 비움·장소 뺌)·
//   장소 후보 목록(처리방침 v1.2 — 이름만)·모델이 고른 이름 다른 장소 = 되묻기. --live G = 같은 버그 재현(냇가·수박) + 장소록의 곳을 말하면 연결.
// ⑲(LLM 0) = 제안 카드 시기 id·이름 확인 — 모델 답(JSON)을 넣어: id 아랫줄 + 이름 맞음 → 이름 쪽 시기, 둘 다 틀림 → 시기 미지정
//   ([만들기] = 시기를 골라 주세요), 이름 없는 옛 응답·새 시기·주제 시기 그대로 · 같은 이름 시기 둘(id 가 가름) · 프롬프트 안 (a)
//   (이름 먼저 + 그 이름 줄의 id, 2026-11-03) · 재생 세트(db/test-fixtures/proposal-replay — 실제 모델 비교는 db/replay-proposals.ts).
// ⚠️ .env 가 운영 DB — 자기 픽스처 계정(fixture-chat-proposal@·fixture-chat-e2e@lifebook.invalid)만 만들고 끝에 지운다.
// 실고객·test30 접촉 0. 원가 원장(ChatV3Usage)은 실제 호출 원가라 남긴다(탈퇴처럼 userId 만 비워짐).

import "dotenv/config";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

import { deleteAccountTx } from "../lib/account-deletion";
import {
  costMicroUsd,
  dayStartKst,
  isOverDailyBudget,
  isTestAccountEmail,
  recordChatUsage,
  spentTodayMicroUsd,
  testBudgetMicroUsd,
  testSpentTodayMicroUsd,
} from "../lib/chat-v3-usage";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import { createEpisodeBridge } from "../lib/episode";
import {
  applyLeftoverRule,
  closeIdleSegment,
  createFromFreeChatProposal,
  declineFreeChatProposal,
  decideProposal,
  freeChatReply,
  getFreeChatState,
  recentSavedStories,
  getFreeChatTopic,
  isAppNotice,
  outsideSegmentText,
  isShortLeftover,
  LEFTOVER_SHORT_MAX_CHARS,
  LEFTOVER_SHORT_MAX_TURNS,
  parseReplyOutput,
  proposeFromSegment,
  replyResultFrom,
  SEGMENT_IDLE_CLOSE_MS,
  startFreeTopic,
  substantiveUserTurns,
  type FreeChatReplyResult,
} from "../lib/free-chat";
import { FREE_CHAT_COPY } from "../lib/free-chat-copy";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { Prisma } from "../lib/generated/prisma/client";
import { kstDay } from "../lib/interview/keys";
import { nextInterviewState } from "../lib/interview/session";
import { getMyLifeData } from "../lib/my-life";
import { searchMyLife } from "../lib/my-life-search";
import {
  cardToEdit,
  contentWords,
  createFromCard,
  foreignOnlyWords,
  overlappingPlaces,
  parseCard,
  personRow,
  pickCenter,
  placeFromModel,
  placeRow,
  placeSaidNow,
  referencedPeople,
  referencedPlaces,
  type CardEdit,
  type ProposalCard,
} from "../lib/node-proposal";
import { getPendingPeopleGroups } from "../lib/node-confirm";
import { saveProposedPeople } from "../lib/person-chat";
import { periodMemoryId, syncV3Bridge } from "../lib/poster/v3-bridge";
import { buildFreeChatReplySystemPrompt, buildProposalUserMessage, PROPOSAL_SYSTEM_PROMPT } from "../lib/prompts/free-chat";
import { DEFAULT_PERIOD_LABELS, displayTitle, isPeriodNameTitle, SHORT_TITLE_MAX, shortTitle, storedStoryTitle } from "../lib/story-title";
import { appendLiveStat, requireTestBudget, saveLiveFailure } from "./live-log";

const FIXTURE_EMAIL = "fixture-chat-proposal@lifebook.invalid";
const ROOT = path.resolve(__dirname, "..");
const LIVE = process.argv.includes("--live");
const SESSION = "test-chat-proposal";

let failed = 0;
// 실제 모델 항목 실패 기록용 — 지금 시나리오에서 주고받은 말(say 가 쌓고, resetSegment·E2E 재현 시작이 비운다).
let liveConversation: { role: "user" | "assistant"; text: string }[] = [];
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) {
    failed += 1;
    // 실제 모델 항목("실제")은 입력 = 이 시나리오에서 주고받은 말, 출력 = detail 로 남긴다.
    saveLiveFailure("test-chat-proposal", label, label.includes("실제") ? { input: liveConversation, output: detail ?? null } : (detail ?? null));
  }
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
  liveConversation.push({ role: "user", text });
  await sleep(5);
  const r = await freeChatReply(userId);
  if (r.kind === "reply") {
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: r.reply } });
    liveConversation.push({ role: "assistant", text: r.reply });
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
  check("⑦ 자유 대화 서버 액션 전부 첫 줄 = requireUserId()(개수는 안 봄)", actions.length >= 1 && actions.every((a) => /^const userId = await requireUserId\(\);$/.test(a.first)), actions);
  const appFiles = walk(path.join(ROOT, "app"));
  const uses = (re: RegExp) => appFiles.filter((f) => re.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
  // 호출·import 만 본다(주석의 이름은 제외).
  const promote = /(promoteOpenTurn|respondToOpenChat|submitPersonAnswer)\s*\(|from\s+["'][^"']*(open-chat|actions\/person-chat)["']/;
  check("⑦ 자유 발화 즉시 중심 생성 0 — app 에서 promoteOpenTurn·respondToOpenChat·submitPersonAnswer 호출 없음", uses(promote).length === 0, uses(promote));
  // "확인 대기를 만드는 경로 0" 은 파일 검색 대신 이 실행의 모든 저장 뒤 DB 로 본다(noPendingChecks — 2026-11-03).
  check("⑦ /chat-v3 대화창 확인 카드 제거", !read("app/chat-v3/ChatV3Client.tsx").includes("CONFIRM_COPY"));
  check("⑦ /enter V3 설정 완료 → /my-life(Q68)", /if \(unconfirmed === 0\) \{\s*redirect\("\/my-life"\);/.test(read("app/enter/page.tsx")));
  // 화면 렌더 확인은 브라우저가 필요해 정적 확인 — 개수는 안 본다(버튼 자리를 옮기거나 늘려도 안 깨지게, 2026-11-03).
  check("⑦ /my-life 채팅 진입 버튼(→ /chat-v3) 있음", read("app/my-life/MyLifeView.tsx").includes('href="/chat-v3"'));
  check("⑦ proxy.ts 무접촉(자유 대화 언급 없음)", !/free-chat|chat-v3/.test(read("proxy.ts")));
  // Q70 — 장소 후보 목록은 처리방침 v1.2(3항 Anthropic 이전 항목 "장소 이름") 이후에만(2026-11-02 반영). 이름만, 주소·좌표 없음.
  check("⑦ 제안 호출 장소 후보(Q70) — 처리방침 3항 Anthropic 항목에 장소 이름이 있을 때만 · 보내는 칸은 id·이름뿐",
    read("lib/prompts/free-chat.ts").includes("[이미 있는 장소]") === /to: "Anthropic, PBC",[^}]*?items:\s*"[^"]*장소 이름/.test(read("app/privacy/page.tsx")) &&
      /places: \{ id: string; name: string \}\[\];/.test(read("lib/prompts/free-chat.ts")) &&
      /select: \{ id: true, name: true \}/.test(read("lib/node-proposal.ts").slice(read("lib/node-proposal.ts").indexOf("async function userPlaces"))));
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
  liveConversation = [];
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { startedAt: new Date(), proposal: Prisma.DbNull, topicEventId: eventId, topicGapType: eventId ? "episode" : null, topicPersonId: null },
  });
  await sleep(5);
}

async function usageSince(userId: string, since: Date) {
  const rows = await prisma.chatV3Usage.findMany({ where: { userId, createdAt: { gte: since } }, select: { purpose: true, model: true, inputTokens: true, outputTokens: true, costMicroUsd: true } });
  // 테스트 계정 사용분은 purpose 앞에 TEST_(lib/chat-v3-usage — 전역 예산 합계 제외)가 붙는다.
  const sum = (p?: string) => rows.filter((r) => !p || r.purpose.replace(/^TEST_/, "") === p);
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
  // 실패 기록용 — 제안 모델이 받은 대화(카드 transcript)와 그때 주제(2026-11-02 시기 = 군 입대로 한 번 틀림 — 원인 추적).
  const segP = await prisma.chatV3Segment.findUnique({ where: { userId }, select: { proposal: true, topicEventId: true, topicGapType: true } });
  check("⑤ 실제 — 카드(Sonnet): 시기 = 고등학교 입학 · 박영수 = 이미 계신 분 · 경주 불국사",
    !!card && !!card.center && "id" in card.center && card.center.id === ev.HIGH_SCHOOL && card.people.some((x) => x.personId === fx.friendId) && card.places.some((x) => x.name.includes("불국사")) && card.summary.length > 10,
    { card, transcript: parseCard(segP?.proposal)?.transcript ?? null, topic: { eventId: segP?.topicEventId, gapType: segP?.topicGapType, isHighSchool: segP?.topicEventId === ev.HIGH_SCHOOL } });
  const made = await createFromFreeChatProposal(userId);
  check("⑤ 실제 — [만들기] 저장 · 확인 대기 0", made.ok && JSON.stringify(await draftsAndProposed(userId)) === JSON.stringify({ drafts: 0, proposed: 0 }), made);
  const u = await usageSince(userId, t0);
  check("⑤ 원가 원장 — 응답 2(Haiku) + 제안 ≥1(Sonnet)", u.reply.calls === 2 && (u.reply.model ?? "").includes("haiku") && u.proposal.calls >= 1 && (u.proposal.model ?? "").includes("sonnet"), u);
  console.log("   이야기 1편 원가:", JSON.stringify(u));
}

async function liveScenarios(fx: Fixture) {
  const { userId, ev } = fx;

  // A. 일단락 판단 — 마무리 말 없이 이야기하면 제안이 뜨는지. 일단락 판단은 모델 판단이라 흔들린다(2026-11-02 연속 2회
  // 4턴째 continue) — 6턴 강제 제안이 안전장치. 통과 기준 = 6턴 안에 제안. 4턴 이내(AI 판단) 제안 여부는 통과/실패가 아니라
  // db/test-logs/live-stats.jsonl 에 실행마다 쌓아 비율로 본다.
  await resetSegment(userId, null);
  const tA = new Date();
  const aLines = [
    "군대 갔을 때 이야기 하나 할게요. 논산 훈련소에서 첫날 밤에 잠이 하나도 안 왔어요.",
    "집 생각이 많이 났지요. 어머니가 싸 주신 미숫가루를 동기들이랑 나눠 먹었어요.",
    "그래도 그 동기들 덕분에 버텼어요. 지금 생각해도 고마운 사람들이에요.",
    "네, 그날 일은 그렇게 지나갔어요. 이제 생각하면 웃음이 나요.",
    "제대하던 날에는 동기들이랑 부대 앞에서 사진도 찍었어요.",
    "그 사진은 아직도 앨범에 꽂혀 있어요.",
  ];
  const a: FreeChatReplyResult[] = [];
  for (const line of aLines) {
    const r = await say(userId, line);
    a.push(r);
    if (r.kind === "reply" && r.propose) break;
  }
  const aLast = a[a.length - 1];
  const aTurns = a.length;
  const aProposed = aLast?.kind === "reply" && !!aLast.propose;
  const aStats = appendLiveStat("A-일단락-4턴이내", { turns: aProposed ? aTurns : null, within4: aProposed && aTurns <= 4 });
  const aRate = `${aStats.filter((x) => x.within4).length}/${aStats.length}`;
  console.log(`   A 일단락: ${aTurns}턴 만에 제안=${aProposed} · 4턴 이내(AI 판단) 누적 ${aRate}`, JSON.stringify(a.map((r) => (r.kind === "reply" ? r.reply : r.kind))));
  check("A 실제 — 마무리 말 없이 이야기해도 6턴 안에 제안(일단락 판단 또는 6턴 강제)", aProposed && aTurns <= 6, {
    input: aLines.slice(0, aTurns),
    output: a,
  });
  if (aProposed) {
    const p = await proposeFromSegment(userId, { until: aLast.kind === "reply" ? aLast.propose?.until ?? null : null });
    const card = p.kind === "card" ? p.view.card : null;
    check("A 실제 — 카드 시기 = 군 입대", !!card && !!card.center && "id" in card.center && card.center.id === ev.MILITARY, card);
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
  const msg = buildProposalUserMessage({ centers: [], people: [], places: [], topic: null, birthYear: 1958, transcript: "[본인] x", alreadySaved: [{ title: "개울 물고기", summary: "개울에서 물고기를 잡았다." }] });
  check("⑨-1 제안 입력에 [방금 남긴 이야기 — 주제 힌트로만, 제목·본문·장소에 쓰지 마세요] 제목·본문", msg.includes("[방금 남긴 이야기 — 주제 힌트로만, 제목·본문·장소에 쓰지 마세요]\n- 개울 물고기: 개울에서 물고기를 잡았다."));

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
  // 사용자가 [고치기]로 직접 시기 이름을 제목으로 적은 경우(저장 규칙의 예외 — ⑫).
  const periodNamed = await createEpisodeBridge(userId, ev.HIGH_SCHOOL, "고등학교 입학", 1968, "교복을 처음 입었다.", "[본인] 교복", undefined, false, "STORY", true);
  const data = await getMyLifeData(userId);
  const all = data.events.flatMap((e) => e.stories);
  const titled = all.find((x) => made.ok && x.id === made.episodeId);
  const old = all.find((x) => x.id === cleared?.episodeId);
  const named = all.find((x) => x.id === periodNamed?.episodeId);
  check("⑨-2 지도·목록 글자 — 제목 있는 이야기 = 제목 / 제목을 비운 옛 이야기 = 본문 첫 문장 / 사용자가 적은 시기 이름 제목은 그대로(조건 제거)",
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
  // ⑰·--live G(2026-11-02 — 제목 출처 버그 재현·장소 후보)
  "냇가", "수박", "장작", "물집", "나루터", "해 질 녘",
  // ⑱·--live H·I(2026-11-02 E2E 재검증 재현 — 운영 test30 같은 문장)
  "분식집", "떡볶이", "이영희", "국수", "박정자",
  // 제안 재생 세트(2026-11-03 — db/test-fixtures/proposal-replay, 같은 픽스처 입력)
  "사촌 동생", "이철수", "박순자", "최유령", "유령 장소", "동기들",
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

// ─── 제안 재료 확인 + 장소 후보(2026-11-02) — LLM 0 ─────────────────────────────

// 버그 재현 문장(운영과 같은 모양): 저장된 구간 "냇가에서 수박을 먹었어요" → 새 구간 카드 제목 "냇가에서 수박 나눠 먹던 날".
const SAVED_LINES = ["여름이면 냇가에서 수박을 먹었어요", "동생이랑 나눠 먹었어요"];
const NEW_LINES = ["겨울에는 아버지랑 장작을 팼어요", "손에 물집이 잡혔어요"];

async function materialChecks(fx: Fixture) {
  const { userId } = fx;
  const src = { user: NEW_LINES.join(" "), foreign: [...SAVED_LINES, "냇가에서 수박 먹던 여름", "여름이면 냇가에서 동생과 수박을 나눠 먹었다."].join("\n"), allowed: "국민학교 입학 중학교 입학" };
  check("⑰ 낱말 뽑기 — 조사 떼고 2자 이상(냇가에서 → 냇가)", contentWords("냇가에서 수박 나눠 먹던 날").join() === "냇가,수박,나눠,먹던", contentWords("냇가에서 수박 나눠 먹던 날"));
  const leaked = foreignOnlyWords("냇가에서 수박 나눠 먹던 날", src);
  check("⑰ 재현 제목 \"냇가에서 수박 나눠 먹던 날\" → 구간 밖 낱말(냇가·수박) 잡힘", leaked.includes("냇가") && leaked.includes("수박"), leaked);
  check("⑰ 이번 구간 말로 지은 제목 → 0(아버지랑 장작 패던 날)", foreignOnlyWords("아버지랑 장작 패던 날", src).length === 0, foreignOnlyWords("아버지랑 장작 패던 날", src));
  check("⑰ 같은 소재를 이번 구간에 다시 말했으면 통과(\"그 냇가에 다음 날 또 갔어요\")",
    foreignOnlyWords("냇가에 또 간 날", { ...src, user: "그 냇가에 다음 날 또 갔어요" }).length === 0);
  check("⑰ 주제·시기 이름은 힌트라 통과(중학교)", foreignOnlyWords("중학교 겨울 장작", { ...src, foreign: src.foreign + " 중학교" }).length === 0);
  check("⑰ 구간 밖 글이 없으면(첫 구간·인터뷰) 확인 안 함", foreignOnlyWords("냇가에서 수박 나눠 먹던 날", { ...src, foreign: "" }).length === 0);
  check("⑰ 장소 — 구간 밖에만 있는 곳(냇가) 뺌 · 이번에 말한 곳(뒷마당) 둠 · 후보 목록에서 옮겨 온 곳(말 안 함) 뺌",
    !placeSaidNow("냇가", src) && placeSaidNow("뒷마당", { ...src, user: src.user + " 뒷마당에서 쌓았어요" }) && !placeSaidNow("강변 나루터", src));

  // 장소 후보(이름만) — 제안 입력에 [이미 있는 장소] id·이름.
  const naru = await prisma.place.create({ data: { userId, name: "강변 나루터", address: "[fixture] 주소는 보내지 않음" }, select: { id: true } });
  const rows = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true } });
  const msg = buildProposalUserMessage({ centers: [], people: [], places: rows, topic: null, birthYear: 1952, transcript: "[본인] x", alreadySaved: [] });
  check("⑰ 제안 입력에 [이미 있는 장소] id·이름(주소 없음)", msg.includes(`[이미 있는 장소]\n`) && msg.includes(`- ${naru.id} · 강변 나루터`) && !msg.includes("주소는 보내지 않음"));
  check("⑰ 프롬프트 — 재료 = 본인 말·방금 남긴 이야기 힌트만·장소 matchId 규칙",
    PROPOSAL_SYSTEM_PROMPT.includes("재료는 [대화]에서 본인이 한 말뿐입니다") && PROPOSAL_SYSTEM_PROMPT.includes("[방금 남긴 이야기]에 나온 사물·장소·일을 제목에 넣지 마세요") &&
      PROPOSAL_SYSTEM_PROMPT.includes("\"matchId\": \"이미 있는 장소 id 또는 null\"") && PROPOSAL_SYSTEM_PROMPT.includes("확실하지 않으면 null"));
  // 모델이 고른 후보 — 같은 이름이면 그곳, 이름이 다르면 되묻기 맨 앞, 없는 id 무시.
  const exact = placeFromModel(rows, "강변나루터", null);
  const fuzzy = placeFromModel(rows, "나루터", naru.id);
  const ghost = placeFromModel(rows, "나루터", "no-such-place");
  const other = placeFromModel(rows, "강가 선착장", naru.id);
  check("⑰ 모델 후보 — 같은 이름(공백 무시) = 그곳 · 줄인 이름(나루터 ⊂ 강변 나루터) = 그곳(⑱ 규칙) · 이름이 다른데 후보 고름 = 되묻기 맨 앞 · 없는 id = 새로",
    exact.placeId === naru.id && fuzzy.placeId === naru.id && other.placeId === null && other.overlap?.[0]?.id === naru.id && ghost.placeId === null && (ghost.overlap?.length ?? 0) === 0, { exact, fuzzy, other, ghost });
  const placesBefore = await prisma.place.count({ where: { userId } });
  const card = baseCard({ title: "[fixture] 나루터 이야기", center: { id: fx.ev.ELEM_SCHOOL, label: "국민학교 입학", year: 1959 }, places: [{ ...other, name: "나루터" }] });
  const asked = await createFromCard(userId, card, cardToEdit(card));
  check("⑰ [만들기] — 이름 다른 후보 = 되묻기(서버 카드의 후보, 저장 0)",
    !asked.ok && asked.reason === "ask" && asked.placeAsk[0]?.candidates.some((c) => c.id === naru.id) === true && (await prisma.place.count({ where: { userId } })) === placesBefore, asked);
  const same = await createFromCard(userId, card, { ...cardToEdit(card), places: [{ name: "나루터", placeId: null, decision: "same", samePlaceId: naru.id }] });
  const ep = same.ok ? await prisma.episode.findUnique({ where: { id: same.episodeId }, select: { memoryId: true } }) : null;
  const mp = ep ? await prisma.memoryPlace.findMany({ where: { memoryId: ep.memoryId }, select: { placeId: true } }) : [];
  check("⑰ [같은 곳이에요] → 기존 강변 나루터에 연결 · 새 장소 0",
    same.ok && mp.length === 1 && mp[0].placeId === naru.id && (await prisma.place.count({ where: { userId } })) === placesBefore, { same, mp });

  // 구간 밖 글 = 구간 시작 전 본인 말 + 방금 남긴 이야기(제목·본문). 구간 안 말·동반자 말은 안 들어감.
  const t0 = new Date();
  await sleep(5);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "[fixture] 앞 구간 본인 말 냇가" } });
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: "[fixture] 앞 구간 동반자 말" } });
  await sleep(5);
  const segStart = new Date();
  await sleep(5);
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: "[fixture] 이번 구간 본인 말" } });
  const outside = await outsideSegmentText(userId, segStart, [{ title: "수박 먹던 여름", summary: "냇가에서 수박을 먹었다." }]);
  check("⑰ 구간 밖 글 — 앞 구간 본인 말 + 남긴 이야기 제목·본문, 이번 구간 말·동반자 말 없음",
    outside.includes("앞 구간 본인 말 냇가") && outside.includes("수박 먹던 여름") && outside.includes("냇가에서 수박을 먹었다.") &&
      !outside.includes("이번 구간 본인 말") && !outside.includes("동반자 말"), outside);
  await prisma.onboardingChatMessage.deleteMany({ where: { userId, createdAt: { gte: t0 }, content: { startsWith: "[fixture]" } } });
  check("⑰ 제안 쪽 연결 — proposeFromSegment 가 구간 밖 글을 넘기고, buildProposal 이 제목·장소를 확인",
    /foreignText: await outsideSegmentText\(userId, seg\.startedAt, alreadySaved\)/.test(read("lib/free-chat.ts")) &&
      /const leaked = foreignOnlyWords\(modelTitle, guard\)/.test(read("lib/node-proposal.ts")) && /if \(!placeSaidNow\(name, guard, matched\)\)/.test(read("lib/node-proposal.ts")));
}

// ─── 이어지는 구간의 기존 장소·인물(2026-11-02 E2E 재검증) — LLM 0 ───────────────────
async function referenceChecks(fx: Fixture) {
  const { userId } = fx;
  // 재료 확인 — 움직임·꾸밈 말(먹던·매운)은 줄기로 비교해 제목을 비우지 않음(재현: 앞 제목 "시험 끝나고 먹던 떡볶이").
  const src = {
    user: "그 분식집 떡볶이가 정말 매웠어요 네 물 마셔 가며 먹었어요",
    foreign: "대학교 때 학교 앞 분식집에서 동기 이영희랑 떡볶이를 자주 먹었어요\n시험 끝나고 먹던 떡볶이\n대학교 때 학교 앞 분식집에서 동기 이영희와 떡볶이를 자주 먹었다.",
    allowed: "출생 대학교 입학",
  };
  check("⑱ 재료 확인 — 재현 제목 \"물 마셔 가며 먹던 매운 떡볶이\" = 구간 밖 낱말 0(먹던·매운은 움직임 말 — 줄기 먹·매로 비교)",
    foreignOnlyWords("물 마셔 가며 먹던 매운 떡볶이", src).length === 0, foreignOnlyWords("물 마셔 가며 먹던 매운 떡볶이", src));
  check("⑱ 재료 확인 — 명사는 그대로 잡음(냇가·수박 재현 유지)",
    foreignOnlyWords("냇가에서 수박 나눠 먹던 날", { user: "겨울에는 아버지랑 장작을 팼어요", foreign: "여름이면 냇가에서 수박을 먹었어요", allowed: "" }).join() === "냇가,수박");

  const shop = await prisma.place.create({ data: { userId, name: "학교 앞 분식집" }, select: { id: true } });
  const home = await prisma.place.create({ data: { userId, name: "외할머니 댁" }, select: { id: true } });
  const rows = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true } });
  check("⑱ 장소 — 모델이 후보를 고른 기존 이름(학교 앞 분식집)은 \"학교\"가 앞 이야기에만 있어도 남김(그곳을 가리킴)",
    placeSaidNow("학교 앞 분식집", { ...src, allowed: "" }, "학교 앞 분식집") && !placeSaidNow("학교 앞 분식집", { ...src, allowed: "" }));
  check("⑱ 장소 — 후보 없이 앞 이야기에만 있는 곳은 여전히 뺌 · 후보를 골랐어도 본인이 이번에 안 말한 곳은 뺌",
    !placeSaidNow("외할머니 댁", { user: "그 분식집 떡볶이가 매웠어요", foreign: "외할머니 댁에 갔어요", allowed: "" }) &&
      !placeSaidNow("외할머니 댁", { user: "그 분식집 떡볶이가 매웠어요", foreign: "외할머니 댁에 갔어요", allowed: "" }, "외할머니 댁"));
  const viaPoint = placeFromModel(rows, "분식집", shop.id, "그 분식집 떡볶이가 정말 매웠어요");
  const viaHead = placeFromModel(rows, "그 가게", shop.id, "그 분식집 떡볶이가 정말 매웠어요");
  const unsure = placeFromModel(rows, "그 가게", shop.id, "가게 떡볶이가 매웠어요");
  check("⑱ 장소 — 후보를 골랐고 줄인 이름(분식집)·\"그 <끝말>\"이면 기존 노드로 연결 · 그 밖이면 되묻기(확신 낮음)",
    viaPoint.placeId === shop.id && viaHead.placeId === shop.id && unsure.placeId === null && unsure.overlap?.[0]?.id === shop.id, { viaPoint, viaHead, unsure });
  const ref1 = referencedPlaces("그 분식집 떡볶이가 정말 매웠어요", rows, new Set());
  const refIn = referencedPlaces("그 분식집 떡볶이가 정말 매웠어요", rows, new Set([shop.id]));
  const refNo = referencedPlaces("분식집 떡볶이가 매웠어요", rows, new Set());
  check("⑱ 장소 — 모델이 빠뜨린 \"그 분식집\"을 코드가 기존 노드로 · 카드에 이미 있으면 안 더함 · \"그\" 없는 일반 말은 안 잡음",
    ref1.length === 1 && ref1[0].placeId === shop.id && ref1[0].name === "학교 앞 분식집" && refIn.length === 0 && refNo.length === 0, { ref1, refIn, refNo });
  const twin = await prisma.place.create({ data: { userId, name: "역 앞 분식집" }, select: { id: true } });
  const rows2 = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true } });
  const ref2 = referencedPlaces("그 분식집 떡볶이가 정말 매웠어요", rows2, new Set());
  check("⑱ 장소 — 끝말이 같은 내 장소가 여럿이면 연결하지 않고 되묻기(후보 2)",
    ref2.length === 1 && ref2[0].placeId === null && ref2[0].overlap?.map((o) => o.id).sort().join() === [shop.id, twin.id].sort().join(), ref2);
  await prisma.place.deleteMany({ where: { id: { in: [shop.id, home.id, twin.id] } } });

  const ppl = [
    { id: "m1", name: "박정자", relation: "어머니" },
    { id: "f1", name: "이영희", relation: "대학 동기" },
    { id: "a1", name: "김철수", relation: "친구" },
    { id: "a2", name: "김철수", relation: "직장 동료" },
  ];
  const r1 = referencedPeople("어머니가 시장에서 국수를 사 주셨어요", ppl, new Set());
  const r2 = referencedPeople("친구 어머니가 국수를 사 주셨어요", ppl, new Set());
  const r3 = referencedPeople("그날도 이영희랑 같이 갔어요", ppl, new Set());
  const r4 = referencedPeople("김철수가 왔어요", ppl, new Set());
  const r5 = referencedPeople("우리 엄마가 마중 나오셨어요", ppl, new Set(["m1"]));
  check("⑱ 사람 — 본인 가족 호칭(어머니)·이름(이영희)은 이미 계신 분으로 · \"친구 어머니\"는 아님 · 같은 이름 두 분은 안 잡음 · 카드에 이미 있으면 안 더함",
    r1.map((p) => p.id).join() === "m1" && r2.length === 0 && r3.map((p) => p.id).join() === "f1" && r4.length === 0 && r5.length === 0, { r1, r2, r3, r4, r5 });
  const people2 = [{ id: "m1", name: "박정자", relation: "어머니" }, { id: "m2", name: "최영순", relation: "엄마" }];
  check("⑱ 사람 — 같은 호칭 묶음이 두 분(어머니·엄마)이면 안 잡음(확신 낮음 — 모델·되묻기 몫)", referencedPeople("어머니가 오셨어요", people2, new Set()).length === 0);

  check("⑱ 프롬프트 — 이번에 다시 말한 사람·장소(줄임·가리킴·호칭)는 넣고 matchId · 앞 이야기 \"다시 쓰지 말 것\"은 다시 말하지 않은 것만",
    PROPOSAL_SYSTEM_PROMPT.includes("[방금 남긴 이야기]에 나왔던 곳이라도 이번에 다시 말했으면") &&
      PROPOSAL_SYSTEM_PROMPT.includes("[방금 남긴 이야기]에 나왔던 분이라도 이번에 다시 말했으면 넣습니다") &&
      PROPOSAL_SYSTEM_PROMPT.includes("이번에 다시 말하지 않은 그 내용을 title·summary·places 어디에도 다시 쓰지 마세요"));
  check("⑱ 제안 쪽 연결 — buildProposal 이 모델이 고른 후보 이름으로 장소 확인·코드 보충(장소·사람)",
    /placeSaidNow\(name, guard, matched\)/.test(read("lib/node-proposal.ts")) && /referencedPlaces\(rawUserText, owned,/.test(read("lib/node-proposal.ts")) &&
      /referencedPeople\(rawUserText, people,/.test(read("lib/node-proposal.ts")));
}

// --live H·I — 2026-11-02 E2E 재검증 같은 문장(실제 Haiku·Sonnet): H "학교 앞 분식집" 저장 → 다음 구간 "그 분식집 …" → 카드 장소 = 그곳
// (바로 연결, 또는 되묻기 후보 맨 앞 → [같은 곳이에요]) · [만들기] 뒤 새 장소 0. I 이미 계신 어머니(박정자)를 "어머니"로 말함 → 그분.
async function liveReferences() {
  liveConversation = [];
  const EMAIL = "fixture-chat-reference@lifebook.invalid";
  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const now = new Date();
  const userId = (
    await prisma.user.create({
      data: {
        email: EMAIL, name: "[fixture] chat reference", birthYear: 1975, onboardingTrack: "V3",
        termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION,
      },
      select: { id: true },
    })
  ).id;
  try {
    await prisma.onboardingProfile.create({ data: { userId, birthYear: 1975, region: "서울", skeletonGeneratedAt: now } });
    const rows: [LifeEventType, string, number][] = [["BIRTH", "출생", 1975], ["HIGH_SCHOOL", "고등학교 입학", 1991], ["UNIVERSITY", "대학교 입학", 1994]];
    for (const [i, [type, label, year]] of rows.entries()) {
      await prisma.lifeEvent.create({ data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: now, sequenceOrder: i, personAsked: true } });
    }
    await prisma.person.create({ data: { userId, name: "이영희", relation: "대학 동기", metYear: 1994 } });
    const mom = (await prisma.person.create({ data: { userId, name: "박정자", relation: "어머니", metYear: 1975 }, select: { id: true } })).id;
    await getFreeChatState(userId);
    await sleep(5);

    // H — 첫 구간(같은 문장) → 카드 [만들기](장소 학교 앞 분식집).
    let r: FreeChatReplyResult | null = null;
    for (const line of ["대학교 때 학교 앞 분식집에서 동기 이영희랑 떡볶이를 자주 먹었어요", "시험 끝나면 꼭 거기 갔어요"]) r = await say(userId, line);
    const p1 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const c1 = p1.kind === "card" ? p1.view.card : null;
    const made = c1 ? await createFromFreeChatProposal(userId, cardToEdit({ ...c1, transcript: "" })) : null;
    if (made?.ok) {
      await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.created(made.title) } });
      await sleep(5);
    }
    const shop = await prisma.place.findFirst({ where: { userId, name: { contains: "분식집" } }, select: { id: true, name: true } });
    console.log("   H 카드1:", JSON.stringify(c1 && { title: c1.title, places: c1.places.map((x) => x.name) }), "/ 장소록:", shop?.name);
    check("H 실제 — 첫 구간 카드 [만들기] · 장소록에 분식집(재현 준비)", !!made?.ok && !!shop, { c1, made });

    // 다음 구간 — 운영과 같은 두 문장.
    for (const line of ["그 분식집 떡볶이가 정말 매웠어요", "네 물 마셔 가며 먹었어요"]) r = await say(userId, line);
    const p2 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const stored2 = parseCard((await prisma.chatV3Segment.findUnique({ where: { userId }, select: { proposal: true } }))?.proposal);
    const row = stored2?.places.find((x) => x.placeId === shop?.id || x.overlap?.some((o) => o.id === shop?.id));
    console.log("   H 카드2:", JSON.stringify(stored2 && { title: stored2.title, places: stored2.places }));
    check("H 실제 — \"그 분식집\" → 카드 장소 = 저장한 학교 앞 분식집(바로 연결 또는 되묻기 후보)", p2.kind === "card" && !!row,
      stored2 && { title: stored2.title, places: stored2.places, transcript: stored2.transcript });
    check("H 실제 — 카드2 제목이 움직임 말로 비지 않음(재료 확인 — 앞 제목과 겹치는 먹던·매운)", !!stored2 && stored2.title.trim() !== "", stored2?.title);
    const placesBefore = await prisma.place.count({ where: { userId } });
    let done = p2.kind === "card" ? await createFromFreeChatProposal(userId) : null;
    if (done && !done.ok && done.reason === "ask" && stored2 && shop) {
      const edit = cardToEdit({ ...stored2, transcript: "" });
      done = await createFromFreeChatProposal(userId, {
        ...edit,
        places: edit.places.map((p, i) => (stored2.places[i]?.overlap?.some((o) => o.id === shop.id) ? { ...p, decision: "same" as const, samePlaceId: shop.id } : p)),
      });
    }
    const ep = done?.ok ? await prisma.episode.findUnique({ where: { id: done.episodeId }, select: { memoryId: true } }) : null;
    const mp = ep ? await prisma.memoryPlace.findMany({ where: { memoryId: ep.memoryId }, select: { placeId: true } }) : [];
    check("H 실제 — [만들기] 뒤 새 장소 0 · 이야기 장소 = 학교 앞 분식집",
      !!done?.ok && mp.some((m) => m.placeId === shop?.id) && (await prisma.place.count({ where: { userId } })) === placesBefore, { done, mp });
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.created(done?.ok ? done.title : "x") } });
    await sleep(5);

    // I — 이미 계신 어머니(박정자)를 "어머니"로만 말함 → 카드 사람 = 그분(새로 만들지 않음).
    liveConversation = [];
    for (const line of ["어머니가 시장에서 국수를 사 주셨어요", "그 국수가 참 맛있었어요"]) r = await say(userId, line);
    const p3 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const c3 = p3.kind === "card" ? p3.view.card : null;
    console.log("   I 카드 사람:", JSON.stringify(c3?.people));
    check("I 실제 — \"어머니\" → 이미 계신 박정자(어머니) · 새 분 0", !!c3 && c3.people.some((x) => x.personId === mom) && !c3.people.some((x) => !x.personId && /어머니|박정자/.test(x.name)), c3?.people);
    if (p3.kind === "card") await declineFreeChatProposal(userId);
    const u = await usageSince(userId, new Date(0));
    console.log("   H·I 원가:", JSON.stringify(u));
  } finally {
    await deleteAccountTx(userId);
    const left = await Promise.all([prisma.user.count({ where: { email: EMAIL } }), prisma.onboardingChatMessage.count({ where: { userId } })]);
    check("H·I 정리 — 픽스처 계정·대화 로그 0", left.every((n) => n === 0), left);
  }
}

// --live G — 같은 버그 재현(실제 Haiku·Sonnet): 저장한 구간 "냇가에서 수박" → 다음 구간 카드에 냇가·수박 없음.
// + 장소록에 있는 "강변 나루터"를 대화에서 "나루터"로 말함 → 새로 만들지 않고 그곳에 연결(애매하면 되묻기 → 같은 곳).
async function liveMaterialAndPlaces() {
  liveConversation = [];
  const EMAIL = "fixture-chat-material@lifebook.invalid";
  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const now = new Date();
  const userId = (
    await prisma.user.create({
      data: {
        email: EMAIL, name: "[fixture] chat material", birthYear: 1955, onboardingTrack: "V3",
        termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION,
      },
      select: { id: true },
    })
  ).id;
  try {
    await prisma.onboardingProfile.create({ data: { userId, birthYear: 1955, region: "충청", skeletonGeneratedAt: now } });
    const rows: [LifeEventType, string, number | null][] = [["BIRTH", "출생", 1955], ["ELEM_SCHOOL", "국민학교 입학", 1962], ["MIDDLE_SCHOOL", "중학교 입학", 1968]];
    for (const [i, [type, label, year]] of rows.entries()) {
      await prisma.lifeEvent.create({ data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: now, sequenceOrder: i, personAsked: true } });
    }
    const naru = await prisma.place.create({ data: { userId, name: "강변 나루터" }, select: { id: true } });
    await getFreeChatState(userId);
    await sleep(5);

    // 첫 구간 → 카드 → [만들기](저장된 이야기 = 냇가·수박).
    let r: FreeChatReplyResult | null = null;
    for (const line of SAVED_LINES) r = await say(userId, line);
    const p1 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const c1 = p1.kind === "card" ? p1.view.card : null;
    const made = c1 ? await createFromFreeChatProposal(userId, cardToEdit({ ...c1, transcript: "" })) : null;
    if (made?.ok) {
      await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.created(made.title) } });
      await sleep(5);
    }
    console.log("   G 카드1:", JSON.stringify(c1 && { title: c1.title, summary: c1.summary, places: c1.places.map((x) => x.name) }), "/ 만들기:", made?.ok);
    check("G 실제 — 첫 구간 카드 [만들기](재현 준비 — 저장된 이야기에 냇가·수박)", !!made?.ok && /(냇가|수박)/.test(`${c1?.title} ${c1?.summary}`), { c1, made });

    // 다음 구간 — 다른 이야기. 카드 제목·본문·장소에 앞 이야기 낱말(냇가·수박) 없음.
    for (const line of NEW_LINES) r = await say(userId, line);
    const p2 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const stored2 = parseCard((await prisma.chatV3Segment.findUnique({ where: { userId }, select: { proposal: true } }))?.proposal);
    console.log("   G 카드2:", JSON.stringify(stored2 && { title: stored2.title, summary: stored2.summary, places: stored2.places.map((x) => x.name) }));
    check("G 실제 — 다음 구간 카드 제목·본문·장소에 앞 이야기 낱말(냇가·수박) 없음 · 이번 말(장작) 있음",
      p2.kind === "card" && !!stored2 && !/(냇가|수박)/.test(`${stored2.title} ${stored2.summary} ${stored2.places.map((x) => x.name).join(" ")}`) && /장작/.test(stored2.summary),
      stored2 && { title: stored2.title, summary: stored2.summary, places: stored2.places, transcript: stored2.transcript });
    if (p2.kind === "card") await declineFreeChatProposal(userId);
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.declined } });
    await sleep(5);

    // 장소록에 있는 곳(강변 나루터)을 "나루터"로 말함 → 연결(새 장소 0).
    liveConversation = [];
    for (const line of ["어릴 때 나루터에서 아버지 배가 들어오기를 기다렸어요", "해 질 녘까지 거기 앉아 있곤 했어요"]) r = await say(userId, line);
    const p3 = await proposeFromSegment(userId, { until: r?.kind === "reply" ? (r.propose?.until ?? null) : null });
    const c3 = p3.kind === "card" ? p3.view.card : null;
    const row = c3?.places.find((x) => x.name.includes("나루터"));
    console.log("   G 카드3 장소:", JSON.stringify(c3?.places));
    const linkedOrAsked = !!row && (row.placeId === naru.id || row.overlap?.some((o) => o.id === naru.id) === true);
    check("G 실제 — 장소록의 곳(강변 나루터)을 \"나루터\"로 말함 → 그곳으로 맞춤(바로 연결 또는 되묻기 후보)", linkedOrAsked, c3?.places);
    const placesBefore = await prisma.place.count({ where: { userId } });
    let done = c3 ? await createFromFreeChatProposal(userId) : null;
    if (done && !done.ok && done.reason === "ask" && c3) {
      const edit = cardToEdit({ ...c3, transcript: "" });
      done = await createFromFreeChatProposal(userId, {
        ...edit,
        places: edit.places.map((p) => (p.name.includes("나루터") && !p.placeId ? { ...p, decision: "same" as const, samePlaceId: naru.id } : { ...p, decision: "separate" as const })),
      });
    }
    const ep = done?.ok ? await prisma.episode.findUnique({ where: { id: done.episodeId }, select: { memoryId: true } }) : null;
    const mp = ep ? await prisma.memoryPlace.findMany({ where: { memoryId: ep.memoryId }, select: { placeId: true, placeName: true } }) : [];
    check("G 실제 — [만들기] 뒤 새 장소 0 · 이야기 장소 = 강변 나루터",
      !!done?.ok && mp.some((m) => m.placeId === naru.id) && (await prisma.place.count({ where: { userId, name: { contains: "나루터" } } })) === 1 &&
        (await prisma.place.count({ where: { userId } })) <= placesBefore + Math.max(0, mp.length - 1),
      { done, mp });
    const u = await usageSince(userId, new Date(0));
    console.log("   G 원가:", JSON.stringify(u));
  } finally {
    await deleteAccountTx(userId);
    const left = await Promise.all([prisma.user.count({ where: { email: EMAIL } }), prisma.onboardingChatMessage.count({ where: { userId } })]);
    check("G 정리 — 픽스처 계정·대화 로그 0", left.every((n) => n === 0), left);
  }
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

  // 읽는 곳 — My Life 이야기 이름(Q69 전 /story-review) · 포스터 구간 행 제목 · 방금 남긴 이야기(화면 제목으로 찾음).
  const period = await createEpisodeBridge(userId, ev.MILITARY, "", 1973, "훈련소에서 첫 편지를 썼다. 손이 떨렸다.", "[본인] 편지", undefined, true);
  const lifeStory = (await getMyLifeData(userId)).events.flatMap((e) => e.stories).find((s) => made.ok && s.id === made.episodeId);
  const label = lifeStory ? displayTitle(lifeStory) : undefined;
  const rows = await syncV3Bridge(userId);
  const posterRow = rows.find((r) => !!period && r.id === periodMemoryId(period.episodeId));
  const saved = await recentSavedStories(userId, [lead]);
  check("⑪ 제목 없는 이야기 — My Life 이야기 이름 · 포스터 구간 행 제목 = 본문 첫 문장 · 방금 남긴 이야기로 찾음",
    label === lead && posterRow?.title === "훈련소에서 첫 편지를 썼다." && saved.length === 1 && saved[0].title === lead && saved[0].summary === card.summary,
    { label, posterRow, saved });

  // 나머지 읽는 곳도 실제 결과로 — 찾기 결과 · 인물 확인 묶음 제목 · 오늘의 인터뷰 요약(2026-11-03, 파일마다 title 읽는 횟수를
  // 세던 정적 검사 대신). 인물 확인 대기는 회귀만 쓰는 saveProposedPeople 로 잠깐 만들고 바로 지운다(아래 noPendingChecks 전에).
  const found = searchMyLife(await getMyLifeData(userId), "앞마당").find((r) => r.kind === "story" && made.ok && r.key.endsWith(`:${made.episodeId}`));
  let confirmTitle: string | undefined;
  let summarySaved: string[] | undefined;
  if (made.ok) {
    await saveProposedPeople(userId, ev.ELEM_SCHOOL, made.episodeId, [{ name: "[fixture] 확인 대기 분", relation: "친구" }]);
    confirmTitle = (await getPendingPeopleGroups(userId)).find((g) => g.episodeId === made.episodeId)?.title;
    await prisma.person.deleteMany({ where: { userId, name: "[fixture] 확인 대기 분" } }); // 연결은 DB 트리거가 같이 지움
    const now = new Date();
    const item = await prisma.interviewItem.create({
      data: { userId, day: kstDay(now), ordinal: 1, itemKey: "fixture:title", source: "POOL", status: "ANSWERED", doneAt: now, refId: made.episodeId },
    });
    const state = await nextInterviewState(userId, now);
    summarySaved = state.kind === "summary" ? state.saved : undefined;
    await prisma.interviewItem.delete({ where: { id: item.id } });
  }
  check("⑪ 제목 없는 이야기 — 찾기 결과 · 인물 확인 묶음 제목 · 오늘의 인터뷰 요약 = 본문 첫 문장",
    found?.title === lead && confirmTitle === lead && JSON.stringify(summarySaved) === JSON.stringify([lead]), { found, confirmTitle, summarySaved });
  // 화면 컴포넌트(지도·목록·패널·카드)는 브라우저 렌더가 필요해 정적 확인으로 남긴다 — displayTitle 을 거치는지(있는지)만.
  const code = (rel: string) => read(rel).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const screens = ["app/my-life/MyLifeView.tsx", "app/components/ProposalCard.tsx"].filter((rel) => !code(rel).includes("displayTitle("));
  check("⑪ 화면 컴포넌트(지도·목록·패널·카드)도 displayTitle", screens.length === 0 && !code("app/my-life/MyLifeView.tsx").includes("storyText"), screens);

  // 제목 칸에 시기 이름을 넣는 경로 0 — 오늘의 인터뷰 카드 제목은 문항 주제(질문 풀·"관계별 나")만, 갭 문항(주제 = 시기 이름)은 모델 제목.
  const session = code("lib/interview/session.ts");
  // 풀·관계별 나 문항 제목 = 문항 주제는 test-interview ⑤·⑩ 이 실제 카드·저장 제목으로 본다. 갭 문항은 실제 모델 호출이
  // 더 필요해(그 회귀의 다음 날 계획 기대값도 바뀜) 정적 확인으로 남긴다 — topicIsTitle 개수는 안 본다(2026-11-03).
  check("⑪ 오늘의 인터뷰 카드 제목 — 문항 주제만 고정, 갭 문항은 시기 이름을 제목으로 안 씀",
    /fixedTitle: target\.topicIsTitle \? target\.topicOverride\?\.label : null/.test(session) && !/(fixedTitle|titleHint): target\.topicOverride\?\.label \?\? target\.label/.test(session));
}

// ─── 긴 제목 표시 — 20자 안팎 어절 경계 줄임·카드 제목 2줄·머리말 스크롤 여백(2026-11-02) — LLM 0 ─────

function longTitleChecks() {
  const long = "그해 여름 방학이 시작되자마자 기차를 타고 외할머니 댁으로 내려가서 사촌 동생 정우와 함께 하루 종일 개울에서 물고기를 잡았다.";
  check("⑭ 줄임 — 20자 이하 그대로 / 긴 제목 = 20자 안 어절 경계 + \"…\" / 띄어쓰기 없는 긴 글 = 20자 + \"…\" / 끝 문장부호는 떼고 \"…\"",
    shortTitle("그날 비가 왔다.") === "그날 비가 왔다." && shortTitle("   연 날리던 날 ") === "연 날리던 날" &&
      shortTitle(long) === "그해 여름 방학이 시작되자마자 기차를…" &&
      shortTitle("할머니가부쳐주신감자전을배가터지도록먹었다") === "할머니가부쳐주신감자전을배가터지도록먹었…" &&
      shortTitle("가나다라마바, 사아자차카타파하 거너더러머버서") === "가나다라마바, 사아자차카타파하…" &&
      shortTitle(long).length <= SHORT_TITLE_MAX + 1,
    { long: shortTitle(long) });
  const chat = read("app/chat-v3/ChatV3Client.tsx");
  const map = read("app/my-life/MyLifeView.tsx");
  // 줄인 제목 = 지도 노드 · 목록 보기 · 제목 없는 이야기 패널의 화면 낭독용 제목 줄. 화면 렌더는 브라우저가 필요해 정적 확인 —
  // 쓰는 곳 개수 대신 자리마다 본다(다른 곳에 더 써도 안 깨지게, 2026-11-03).
  check("⑭ 쓰는 곳 — 저장 안내 = 줄인 이름 · 지도 노드·목록 보기·(제목 없는 이야기 패널의 화면 낭독용 제목 줄) = 줄인 제목 · 카드 제목 = 2줄 말줄임(본문은 그대로)",
    chat.includes("FC.created(shortTitle(r.title))") && map.includes('text-ink">{shortTitle(displayTitle(story))}</span>') &&
      map.includes('<span className="text-lg text-ink">{shortTitle(displayTitle(s))}</span>') &&
      map.includes("{hasOwnTitle(story) ? displayTitle(story) : shortTitle(displayTitle(story))}") &&
      /<dd className="m-0 line-clamp-2 text-xl font-bold text-ink">\{displayTitle\(\{ title: edit\.title, content: edit\.summary \}\)\}<\/dd>/.test(read("app/components/ProposalCard.tsx")));
  check("⑭ 카드가 고정 머리말에 안 가림 — 머리말 높이만큼 문서 scroll-padding-top(크기 바뀌면 다시 잼)",
    /root\.style\.scrollPaddingTop = `\$\{el\.offsetHeight\}px`/.test(chat) && chat.includes("new ResizeObserver(apply)") && chat.includes("<header ref={headerRef} className=\"sticky top-0"));
}

// ─── 조사 — 이름 뒤 조사를 받침으로 고른다(2026-11-02) — LLM 0 ──────────────

function josaChecks() {
  const place = (n: string) => FREE_CHAT_COPY.samePlaceQuestion(n);
  check("⑬ 같은 곳 되묻기 조사 — 받침 있음 \"과\"(개울·외할머니 댁·역 앞 다방) / 없음 \"와\"(학교·우물가) / 한글 아님 \"와\"(Tokyo Tower) · \"과/와\" 글자 그대로 0",
    place("개울") === "이미 있는 장소 개울과 같은 곳인가요?" && place("외할머니 댁") === "이미 있는 장소 외할머니 댁과 같은 곳인가요?" &&
      place("역 앞 다방").includes("다방과 ") && place("학교") === "이미 있는 장소 학교와 같은 곳인가요?" && place("동네 우물가").includes("우물가와 ") &&
      place("Tokyo Tower").includes("Tower와 ") && !["개울", "학교", "Tokyo Tower"].some((n) => place(n).includes("과/와")));
  check("⑬ 같은 분 되묻기 — \"님과\"(님 = 받침 있음, 늘 맞음) · 관계 있으면 괄호",
    FREE_CHAT_COPY.sameNameQuestion("김민수", "친구") === "이미 계신 김민수(친구) 님과 같은 분인가요?" && FREE_CHAT_COPY.sameNameQuestion("정우", null) === "이미 계신 정우 님과 같은 분인가요?");
  // 문구 파일 4개 — 이름(보간) 바로 뒤에 조사를 글자로 박은 곳 0(조사는 withJosa 로).
  const hard = ["lib/free-chat-copy.ts", "lib/my-life-copy.ts", "lib/node-confirm-copy.ts", "lib/interview/copy.ts"].flatMap((rel) =>
    read(rel).split("\n").filter((l) => /\$\{[^}]+\}(이|가|을|를|은|는|과|와|으로|로|이랑|랑|에게|께서)[ "`'.,?!)]/.test(l)).map((l) => `${rel}: ${l.trim()}`),
  );
  check("⑬ 문구 파일 — 보간 바로 뒤 조사 하드코딩 0", hard.length === 0, hard);
}

// ─── 시기 이름 제목 재발 방지 — 이야기 저장 한 곳(createEpisodeBridge)의 규칙(2026-11-02) — LLM 0 ────

async function periodTitleGuardChecks(fx: Fixture) {
  const { userId, ev } = fx;
  const own = ["군 입대", null, "서울 상경", "고향 떠난 해"];
  check("⑫ 판정 — 그 계정 시기 이름(고친 이름 포함)·기본 시기 이름 9개·그 이름 + \" 이후\"(공백 무시) = 자리 표시 / 진짜 제목 = 아님",
    isPeriodNameTitle("군 입대", own) && isPeriodNameTitle("고향 떠난 해", own) && isPeriodNameTitle(" 국민학교  입학 ", []) && isPeriodNameTitle("초등학교 입학", []) &&
      isPeriodNameTitle("결혼 이후", []) && isPeriodNameTitle("서울 상경 이후", own) && isPeriodNameTitle("군입대이후", own) && !isPeriodNameTitle("결혼식 날 비가 왔다", own) &&
      !isPeriodNameTitle("엿장수 따라가던 날", own) && !isPeriodNameTitle("", own));
  // "… 이후" 는 시기 이름 + " 이후" 만 — 끝이 "이후"인 일반 제목은 그대로(2026-11-02 좁힘).
  check("⑫ 일반 \"… 이후\" 제목 — \"광복 이후\"·\"그 이후\"·\"아버지 떠나신 이후\"는 자리 표시 아님 · 저장도 그대로",
    !isPeriodNameTitle("광복 이후", own) && !isPeriodNameTitle("그 이후", own) && !isPeriodNameTitle("아버지 떠나신 이후", own) &&
      storedStoryTitle("광복 이후", own, false) === "광복 이후");
  check("⑫ 저장할 제목 — 자리 표시면 빈 문자열 / 사용자가 직접 적었으면 그대로 / 진짜 제목은 그대로(앞뒤 공백 정리)",
    storedStoryTitle("중학교 입학", [], false) === "" && storedStoryTitle("중학교 입학", [], true) === "중학교 입학" && storedStoryTitle("  연 날리던 날 ", [], false) === "연 날리던 날");

  // 기본 시기 이름 9개 = 앱 골격(app/actions/onboarding.ts)이 만드는 이름 — 골격에 시기가 늘면 여기서 걸린다.
  const skeleton = read("app/actions/onboarding.ts");
  const fixed = [...skeleton.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  const elem = /label: `\$\{getElemSchoolLabel\([^)]*\)\} 입학`/.test(skeleton) ? ["국민학교 입학", "초등학교 입학"] : [];
  const skeletonLabels = [...new Set([...fixed, ...elem])].sort();
  check("⑫ 기본 시기 이름 9개 = 앱 골격 시기 이름", JSON.stringify(skeletonLabels) === JSON.stringify([...DEFAULT_PERIOD_LABELS].sort()), { skeletonLabels, DEFAULT_PERIOD_LABELS });

  // 저장 한 곳 — createEpisodeBridge 가 규칙을 건다(시기 이름·기본 이름·"… 이후" → 빈 문자열, userSetTitle 이면 그대로).
  const titleOf = async (r: { memoryId: string } | null) =>
    r ? (await prisma.userMemory.findUnique({ where: { id: r.memoryId }, select: { title: true } }))?.title : undefined;
  const a = await createEpisodeBridge(userId, ev.MILITARY, "군 입대", 1973, "훈련소 첫날 밤 별이 많았다.", "[본인] 별");
  const b = await createEpisodeBridge(userId, ev.MILITARY, "군 입대 이후", 1973, "제대하고 고향에 돌아왔다.", "[본인] 제대", undefined, true);
  const c = await createEpisodeBridge(userId, ev.MILITARY, "결혼", 1973, "휴가 때 선을 봤다.", "[본인] 선");
  const d = await createEpisodeBridge(userId, ev.MILITARY, "군 입대", 1973, "내가 정한 제목이다.", "[본인] 제목", undefined, false, "STORY", true);
  const e = await createEpisodeBridge(userId, ev.MILITARY, "훈련소 별 보던 밤", 1973, "별이 많았다.", "[본인] 별");
  const g = await createEpisodeBridge(userId, ev.MILITARY, "광복 이후", 1973, "만세 소리가 들렸다.", "[본인] 만세");
  const titles = { a: await titleOf(a), b: await titleOf(b), c: await titleOf(c), d: await titleOf(d), e: await titleOf(e), g: await titleOf(g) };
  check("⑫ 저장 — 계정 시기 이름·시기 이름 + \" 이후\"·기본 시기 이름 → 빈 문자열 / 사용자가 적은 시기 이름 → 그대로 / 진짜 제목·\"광복 이후\" → 그대로 · 결과 title = 저장 값",
    titles.a === "" && titles.b === "" && titles.c === "" && titles.d === "군 입대" && titles.e === "훈련소 별 보던 밤" && titles.g === "광복 이후" && a?.title === "" && d?.title === "군 입대", titles);

  // 카드 [만들기] — 카드 제목 그대로면 자동(규칙 적용), [고치기]로 바꾼 제목이면 사용자 제목(시기 이름이어도 그대로).
  const card = baseCard({ title: "고등학교 입학", summary: "입학식 날 교복이 컸다. 어머니가 웃으셨다.", center: { id: ev.HIGH_SCHOOL, label: "고등학교 입학", year: 1968 } });
  const auto = await createFromCard(userId, card, cardToEdit(card));
  const user = await createFromCard(userId, card, { ...cardToEdit(card), title: "군 입대" });
  const autoTitle = auto.ok ? await titleOf(await prisma.episode.findUnique({ where: { id: auto.episodeId }, select: { memoryId: true } })) : undefined;
  const userTitle = user.ok ? await titleOf(await prisma.episode.findUnique({ where: { id: user.episodeId }, select: { memoryId: true } })) : undefined;
  check("⑫ 카드 [만들기] — 카드 제목(시기 이름) 그대로 → 빈 문자열·안내 제목 = 본문 첫 문장 / [고치기]로 적은 시기 이름 → 그대로",
    auto.ok && autoTitle === "" && auto.title === "입학식 날 교복이 컸다." && user.ok && userTitle === "군 입대" && user.title === "군 입대", { auto, autoTitle, user, userTitle });

  // 저장 경로마다 실제 결과 — 카드 [만들기]·[고치기] = 위 검사, 지도 직접 쓰기(빈 제목 → 빈 문자열 · 적은 시기 이름 → 그대로)
  // = test-my-life-edit ①(2026-11-03, 부르는 곳 목록·호출 개수를 세던 정적 검사 대신). 남기는 정적 확인 하나 — Episode 를
  // 만드는 곳이 lib/episode.ts 하나(아직 없는 새 저장 경로가 규칙을 건너뛰는 것은 동작 검사로 잡을 수 없어서).
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
  const creators = files.filter((f) => /\b(tx|prisma)\.episode\.(create|createMany|upsert)\(/.test(read(f)));
  check("⑫ Episode 를 만드는 곳 = lib/episode.ts 하나(createEpisodeBridge — 저장 규칙이 걸리는 곳)", JSON.stringify(creators) === JSON.stringify(["lib/episode.ts"]), creators);
}

// ─── 전역 하루 예산 — 테스트 계정 사용분 제외 + 테스트 한도(2026-11-02) — LLM 0 ─────────────────

// ⑲(LLM 0) = 제안 카드 시기 id·이름 확인(2026-11-02) — 모델이 시기 id 와 함께 이름(label)도 쓴다. 안 맞으면 이름 쪽,
// 이름으로도 못 찾으면 시기 미지정(카드에서 고름). 모델 답(JSON)을 직접 넣어 pickCenter 를 본다.
async function centerLabelChecks(fx: Fixture) {
  const { userId, ev } = fx;
  // 픽스처 시기 = seedFixture 와 같은 순서(sequenceOrder) — 실측은 이 목록의 바로 아랫줄 id 를 썼다.
  const centers = [
    { id: ev.BIRTH, label: "출생", year: 1952 },
    { id: ev.ELEM_SCHOOL, label: "국민학교 입학", year: 1959 },
    { id: ev.HIGH_SCHOOL, label: "고등학교 입학", year: 1968 },
    { id: ev.MILITARY, label: "군 입대", year: 1973 },
    { id: ev.FIRST_JOB, label: "첫 직장", year: 1976 },
  ];
  const topic = centers[1];
  const idOf = (c: ReturnType<typeof pickCenter>) => (c && "id" in c ? c.id : c === null ? null : "new");
  const pick = (center: unknown, fallback = topic) => pickCenter({ title: "[fixture] 제목", center }, centers, fallback, 1952);

  check("⑲ id 아랫줄(군 입대) + 이름 고등학교 입학 → 고등학교 입학(실측 ⑤ 재현)",
    idOf(pick({ matchId: ev.MILITARY, label: "고등학교 입학" })) === ev.HIGH_SCHOOL);
  check("⑲ id 아랫줄(첫 직장) + 이름 군 입대 → 군 입대(실측 A 재현)", idOf(pick({ matchId: ev.FIRST_JOB, label: "군 입대" })) === ev.MILITARY);
  check("⑲ 이름에 연도·가운뎃점이 붙어도(\"고등학교 입학 · 1968년\") → 고등학교 입학",
    idOf(pick({ matchId: ev.MILITARY, label: "고등학교 입학 · 1968년" })) === ev.HIGH_SCHOOL);
  check("⑲ id·이름 둘 다 틀림(대학교 입학) → 시기 미지정 — 주제 시기로도 안 채움",
    pick({ matchId: ev.MILITARY, label: "대학교 입학" }) === null && pick({ matchId: "c_not_mine", label: "대학교 입학" }) === null);
  check("⑲ 이름이 여러 시기에 걸림(\"입학\") — id 시기가 그중 하나면 그 시기, 아니면 미지정",
    idOf(pick({ matchId: ev.ELEM_SCHOOL, label: "입학" })) === ev.ELEM_SCHOOL && pick({ matchId: ev.MILITARY, label: "입학" }) === null);
  check("⑲ 기존 사례 그대로 — id·이름 맞음 → 그 시기 · 이름 없는 옛 응답 → id 만 · 모르는 id(이름 없음) → 주제 시기",
    idOf(pick({ matchId: ev.HIGH_SCHOOL, label: "고등학교 입학" })) === ev.HIGH_SCHOOL &&
      idOf(pick({ matchId: ev.MILITARY })) === ev.MILITARY &&
      idOf(pick({ matchId: "c_not_mine" })) === topic.id);
  const fresh = pick({ new: { label: "고향을 떠난 해", year: 1971 } });
  const none = pickCenter({ title: "[fixture] 제목" }, centers, undefined, 1952);
  check("⑲ 기존 사례 그대로 — 새 시기 → new · 시기 없음 → 주제 시기 · 주제도 없음 → 제목으로 새 시기",
    !!fresh && "new" in fresh && fresh.new.label === "고향을 떠난 해" && fresh.new.year === 1971 &&
      idOf(pick(undefined)) === topic.id && !!none && "new" in none && none.new.label === "[fixture] 제목", { fresh, none });

  // 같은 이름 시기가 둘(2026-11-03 — 직접 추가 시기 "이사"가 두 번, 연도 다름). 이름만으로는 어느 쪽인지 모르므로 id 가 가른다.
  // 이름은 맞고 id 가 동명 다른 시기를 가리키면 id 쪽을 그대로 쓴다 — 이름으로 가를 근거가 없고, id 밀림(실측 = 바로
  // 아랫줄)이 동명 다른 시기에 닿으려면 두 줄이 붙어 있어야 한다(근거 — 설계 §13.13).
  const move1970 = { id: "c_move_1970", label: "이사", year: 1970 };
  const move1982 = { id: "c_move_1982", label: "이사", year: 1982 };
  const withMoves = [centers[0], centers[1], centers[2], move1970, centers[3], centers[4], move1982];
  const pickM = (center: unknown) => pickCenter({ title: "[fixture] 제목", center }, withMoves, undefined, 1952);
  check("⑲ 같은 이름 시기 둘(이사 1970·1982) — 이름 + id 로 그 쪽(id 1970 → 1970 · id 1982 → 1982 · 이름에 연도가 붙어도)",
    idOf(pickM({ label: "이사", matchId: move1970.id })) === move1970.id && idOf(pickM({ label: "이사", matchId: move1982.id })) === move1982.id &&
      idOf(pickM({ label: "이사 · 1982년", matchId: move1982.id })) === move1982.id);
  check("⑲ 이름은 맞고 id 가 동명 다른 시기 → id 쪽 유지 · 이름이 동명 둘인데 id 가 다른 이름 줄(밀림) → 미지정(어느 이사인지 모름)",
    idOf(pickM({ label: "이사", matchId: move1982.id })) === move1982.id &&
      pickM({ label: "이사", matchId: ev.MILITARY }) === null && idOf(pickM({ label: "군 입대", matchId: move1970.id })) === ev.MILITARY);

  // 시기 미지정 카드 — 저장된 카드로 다시 읽히고, [만들기]는 시기를 고를 때까지 아무것도 안 만든다.
  const card = baseCard({ title: "[fixture] 시기 미지정", center: null });
  const before = await Promise.all([prisma.lifeEvent.count({ where: { userId } }), prisma.episode.count({ where: { lifeEvent: { userId } } })]);
  const made = await createFromCard(userId, card, cardToEdit(card));
  const after = await Promise.all([prisma.lifeEvent.count({ where: { userId } }), prisma.episode.count({ where: { lifeEvent: { userId } } })]);
  check("⑲ 시기 미지정 카드 — 다시 읽힘(center null) · 고치기 값 center null · [만들기] = \"시기를 골라 주세요.\" · 저장 0",
    parseCard(card)?.center === null && parseCard({ ...card, center: undefined }) === null && cardToEdit(card).center === null &&
      !made.ok && made.reason === "invalid" && made.message === FREE_CHAT_COPY.needCenter && JSON.stringify(before) === JSON.stringify(after),
    { made, before, after });

  const ui = read("app/components/ProposalCard.tsx");
  check("⑲ 카드 화면 — 시기 줄 = 미지정 문구 · [만들기] 누르면 안내 + [고치기] 시기 고르기 열림 · 고르기 첫 칸",
    ui.includes("if (!c) return C.centerUnset;") && /if \(!edit\.center\) \{\s*setMessage\(C\.needCenter\);\s*setEditing\(true\);/.test(ui) &&
      ui.includes("{C.centerPick}") && ui.includes("aria-disabled={unanswered || !edit.center}"));
  // 2026-11-03 안 (a) — 11-02 "id 와 같은 줄 이름" 지시는 이름을 밀린 id 줄에서 베끼게 해 F 입력 적중 9/10 → 1/10(재생 세트).
  check("⑲ 프롬프트(안 (a)) — 시기 이름을 먼저 label 로, 그 이름이 적힌 줄의 id 를 matchId 로 · \"같은 줄\" 지시 없음",
    PROPOSAL_SYSTEM_PROMPT.includes('{"label": "그 시기 이름", "matchId": "그 이름이 적힌 줄의 id"}') &&
      PROPOSAL_SYSTEM_PROMPT.includes("먼저 그 시기 이름을 [시기 후보]에 적힌 그대로 label 에 쓰고, 그 이름이 적힌 줄의 id 를 matchId 로 쓰세요.") &&
      !PROPOSAL_SYSTEM_PROMPT.includes("id 와 이름은 반드시 같은 줄에서"));
  // 재생 세트(CLAUDE.md 작업 규칙 9) — 사례마다 기대 시기가 그 입력의 [시기 후보]에 있고, 재생 스크립트는 앱과 같은 호출 설정·pickCenter.
  const replayDir = path.join(ROOT, "db/test-fixtures/proposal-replay");
  const replay = fs.readdirSync(replayDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(replayDir, f), "utf8")) as { expectCenter: string; input: string });
  const replaySrc = read("db/replay-proposals.ts");
  check("⑲ 재생 세트 — 사례 3건 이상 · 기대 시기가 입력 [시기 후보]에 있음 · 재생 = 앱 호출 설정(PROPOSAL_CALL)·pickCenter",
    replay.length >= 3 && replay.every((c) => new RegExp(`^- \\S+ · ${c.expectCenter}( · \\d{4}년)?$`, "m").test(c.input)) &&
      replaySrc.includes("...PROPOSAL_CALL") && replaySrc.includes("pickCenter(obj, centers, fallback, c.birthYear)") &&
      read("lib/node-proposal.ts").includes("{ system: PROPOSAL_SYSTEM_PROMPT, ...PROPOSAL_CALL }"),
    replay.map((c) => c.expectCenter));
}

async function budgetChecks(fx: Fixture) {
  const { userId } = fx;
  check("⑯ 테스트 계정 판정 — 이메일 최상위 도메인 .invalid·.test = 테스트 / test.com·gmail.com = 일반",
    isTestAccountEmail("fixture-chat-proposal@lifebook.invalid") && isTestAccountEmail("lab-persona-a@lifebook.invalid") &&
      isTestAccountEmail("p23-test-alice@test") && isTestAccountEmail("sample@lifebook.test") &&
      !isTestAccountEmail("test30@test.com") && !isTestAccountEmail("someone@gmail.com") && !isTestAccountEmail("invalid@example.com") && !isTestAccountEmail(null));

  // 픽스처가 큰 원가($6 — 하루 예산 $5 보다 큼)를 써도 일반 계정 예산 판정은 그대로. 원가 기록은 남는다(TEST_ 표시).
  const before = { spent: await spentTodayMicroUsd(), test: await testSpentTodayMicroUsd() };
  const since = new Date();
  await recordChatUsage(userId, "REPLY", { model: "claude-haiku-4-5-20251001", inputTokens: 6_000_000, outputTokens: 0 });
  const big = await prisma.chatV3Usage.findFirst({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  const after = { spent: await spentTodayMicroUsd(), test: await testSpentTodayMicroUsd() };
  const prevDaily = process.env.CHAT_V3_DAILY_BUDGET_USD;
  process.env.CHAT_V3_DAILY_BUDGET_USD = String(before.spent / 1e6 + 1); // 한도 = 일반 계정 오늘 사용 + $1
  const over = await isOverDailyBudget();
  if (prevDaily === undefined) delete process.env.CHAT_V3_DAILY_BUDGET_USD;
  else process.env.CHAT_V3_DAILY_BUDGET_USD = prevDaily;
  // 일반 계정 사용분은 그대로 센다(userId 없는 일반 행 — 탈퇴한 일반 계정 행과 같은 모양).
  const real = await prisma.chatV3Usage.create({
    data: { userId: null, purpose: "REPLY", model: "claude-haiku-4-5-20251001", inputTokens: 1000, outputTokens: 0, costMicroUsd: 1000 },
    select: { id: true },
  });
  const afterReal = await spentTodayMicroUsd();
  await prisma.chatV3Usage.deleteMany({ where: { id: { in: [big?.id ?? "", real.id] } } });
  check("⑯ 픽스처 $6 사용(원장에 TEST_REPLY) → 일반 계정 오늘 합계 그대로 · 테스트 합계 +$6 · 예산 판정(일반 사용 + $1 한도) 안 넘음 · 일반 행은 그대로 셈",
    big?.purpose === "TEST_REPLY" && big.costMicroUsd === 6_000_000 && after.spent === before.spent && after.test - before.test === 6_000_000 &&
      !over && afterReal - after.spent === 1000,
    { big: big && { purpose: big.purpose, cost: big.costMicroUsd }, before, after, over, afterReal });

  // 테스트 한도(CHAT_V3_TEST_BUDGET_USD) — 넘으면 회귀가 모델을 부르기 전에 멈춘다.
  const prevTest = process.env.CHAT_V3_TEST_BUDGET_USD;
  process.env.CHAT_V3_TEST_BUDGET_USD = "0";
  let stopped = false;
  try {
    await requireTestBudget("⑯ 확인");
  } catch {
    stopped = true;
  }
  if (prevTest === undefined) delete process.env.CHAT_V3_TEST_BUDGET_USD;
  else process.env.CHAT_V3_TEST_BUDGET_USD = prevTest;
  check("⑯ 테스트 한도 넘음(CHAT_V3_TEST_BUDGET_USD 0) → 회귀가 멈춤(throw) · 기본 한도 $10", stopped && (prevTest !== undefined || testBudgetMicroUsd() === 10_000_000));
}

// ─── 남은 구간 처리(2026-11-02) — 운영 test30 E2E 재현(같은 문장·시각 조작) — LLM 0 ──────────

async function leftoverChecks(fx: Fixture) {
  const { userId, ev } = fx;
  const now = new Date();
  const ago = (hours: number, sec = 0) => new Date(now.getTime() - hours * 3_600_000 + sec * 1000);
  const LEFT = "정우가 물고기를 더 많이 잡았어요";
  const LEFT_REPLY = "정우가 더 많이 잡았군요. 그때 물고기를 잡으면서 뭐가 제일 재미있었어요?";
  const NEW = "고등학교 때 여름방학에 삼촌네 과수원에서 사과 따는 걸 도왔어요";
  const LONG = [
    "스물두 살에 처음 서울에 올라와서 영등포 철공소에 들어갔는데 첫날부터 쇠 냄새가 코를 찔렀어요.",
    "공장장님이 무섭기는 했지만 점심때마다 국밥을 사 주시면서 기술을 하나씩 가르쳐 주셨지요.",
    "그때 배운 용접 기술로 나중에 작은 가게를 차릴 수 있었으니 그 시절이 제 밑천이었어요.",
  ];
  const u = (content: string) => ({ role: "user", content });
  check("⑮ 짧은 남은 구간 판정 — 본인 실질 발화 2개 이하 + 공백 뺀 글자 40자 이하 = 짧음 / 3개·긴 1줄 = 실질 내용 / 마무리 말은 안 셈",
    isShortLeftover([u(LEFT)]) && isShortLeftover([u("개울에 갔어요"), u("물이 찼어요")]) && isShortLeftover([u(LEFT), u("그 정도예요")]) &&
      !isShortLeftover([u("하나"), u("둘이요"), u("셋이에요")]) && !isShortLeftover([u(LONG[0])]) &&
      SEGMENT_IDLE_CLOSE_MS === 6 * 3_600_000 && LEFTOVER_SHORT_MAX_TURNS === 2 && LEFTOVER_SHORT_MAX_CHARS === 40);

  const msg = (role: "user" | "assistant", content: string, createdAt: Date) =>
    prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role, content, createdAt }, select: { createdAt: true } });
  const fresh = async (startedAt: Date) => {
    await prisma.onboardingChatMessage.deleteMany({ where: { userId } });
    await prisma.chatV3Segment.update({
      where: { userId },
      data: { startedAt, proposal: Prisma.DbNull, topicEventId: ev.HIGH_SCHOOL, topicGapType: "carry", topicPersonId: null },
    });
  };
  const segNow = () => prisma.chatV3Segment.findUniqueOrThrow({ where: { userId } });
  const usage = () => prisma.chatV3Usage.count({ where: { userId } });
  const logSince = async (from: Date) =>
    (await prisma.onboardingChatMessage.findMany({ where: { userId, createdAt: { gte: from } }, orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } }))
      .map((r) => ({ role: r.role as string, content: r.content, createdAt: r.createdAt }));

  // ① 입장 — 마지막 활동 6시간 넘음 + 짧음(어제 남은 한 줄) → 카드 없이 조용히 닫힘.
  await fresh(ago(9));
  await msg("user", LEFT, ago(7));
  const lastA = await msg("assistant", LEFT_REPLY, ago(7, 1));
  const u0 = await usage();
  const rA = await closeIdleSegment(userId, now);
  const segA = await segNow();
  const stA = await getFreeChatState(userId, now);
  check("⑮ 입장 — 6시간 넘게 지난 짧은 남은 구간 → 조용히 닫힘(구간 = 마지막 메시지 뒤·시기 힌트 끝·카드 0·모델 0)",
    rA === "closed" && segA.startedAt.getTime() === lastA.createdAt.getTime() + 1 && segA.topicEventId === null && segA.proposal === null &&
      stA.segmentTurns === 0 && !stA.stale && stA.proposal === null && (await usage()) === u0,
    { rA, segA: { startedAt: segA.startedAt, topic: segA.topicGapType }, stA });

  // ② 입장 — 6시간 넘음 + 실질 내용 → 그대로 두고 stale(화면이 첫 메시지 전에 "지난번 이야기 남길까요?" 카드).
  await fresh(ago(9));
  for (const [i, line] of LONG.entries()) {
    await msg("user", line, ago(7, i * 20));
    await msg("assistant", "그러셨군요.", ago(7, i * 20 + 1));
  }
  const rB = await closeIdleSegment(userId, now);
  const stB = await getFreeChatState(userId, now);
  check("⑮ 입장 — 6시간 넘게 지난 실질 내용(3턴) → 닫지 않고 stale = 첫 메시지 전에 카드부터",
    rB === "stale" && stB.stale && stB.segmentTurns === 3 && (await segNow()).startedAt.getTime() === ago(9).getTime(), { rB, stB });

  // ③ 6시간 안 — 짧아도 그대로 이어서(같은 날 재진입).
  await fresh(ago(4));
  await msg("user", LEFT, ago(3));
  const rC = await closeIdleSegment(userId, now);
  const stC = await getFreeChatState(userId, now);
  check("⑮ 6시간 안 재진입 — 짧아도 닫지 않음(이어서)", rC === "open" && !stC.stale && stC.segmentTurns === 1, { rC, stC });

  // ④ 같은 날 주제 바뀜 + 짧은 남은 구간 — test30 E2E 그대로(남은 한 줄 3시간 33분 뒤 새 주제 첫 말) → 카드 없이 닫고 새 턴부터.
  await fresh(ago(4));
  await msg("user", LEFT, ago(3, -33 * 60));
  await msg("assistant", LEFT_REPLY, ago(3, -33 * 60 + 1));
  const newTurn = await msg("user", NEW, now);
  const turnsD = await logSince(ago(4));
  const shifted = replyResultFrom('{"reply": "과수원에서 사과를 땄군요. 그때 사과 따는 일이 어땠어요?", "segment": "topic_shift"}', turnsD, false);
  const u1 = await usage();
  const afterD = await applyLeftoverRule(userId, shifted, turnsD);
  const segD = await segNow();
  const stD = await getFreeChatState(userId, now);
  check("⑮ 주제 바뀜 + 짧은 남은 구간(E2E 같은 문장) → 지난 카드 없음 · 새 구간 = 새 주제 첫 턴부터(실질 1턴) · 모델 0",
    shifted.propose?.until === newTurn.createdAt.toISOString() && afterD.propose === null && afterD.segmentTurns === 1 &&
      segD.startedAt.getTime() === newTurn.createdAt.getTime() && segD.proposal === null && segD.topicEventId === null &&
      stD.segmentTurns === 1 && stD.proposal === null && (await usage()) === u1,
    { shifted: shifted.propose, afterD: afterD.propose, startedAt: segD.startedAt, stD });

  // ⑤ 주제 바뀜 + 실질 내용 → 기존대로 앞 이야기를 카드로(닫지 않음).
  await fresh(ago(2));
  for (const [i, line] of LONG.entries()) await msg("user", line, ago(1, i * 20));
  const newE = await msg("user", NEW, now);
  const turnsE = await logSince(ago(2));
  const afterE = await applyLeftoverRule(userId, replyResultFrom('{"reply": "그러셨군요.", "segment": "topic_shift"}', turnsE, false), turnsE);
  check("⑮ 주제 바뀜 + 실질 내용 → 앞 이야기를 새 턴 직전까지 카드로(구간 그대로)",
    afterE.propose?.until === newE.createdAt.toISOString() && (await segNow()).startedAt.getTime() === ago(2).getTime(), afterE.propose);

  // ⑥ 갭 칩으로 다른 주제 + 짧은 남은 구간 → 지난 카드 없이 새 주제 오프닝(모델 0).
  await fresh(ago(2));
  await msg("user", LEFT, ago(1));
  const u2 = await usage();
  const startF = await startFreeTopic(userId, { eventId: ev.MILITARY, kind: "episode" }, SESSION);
  const segF = await segNow();
  check("⑮ 다른 주제(갭 칩) + 짧은 남은 구간 → 지난 카드 없이 새 주제 오프닝 · 모델 0",
    startF.kind === "opening" && segF.topicEventId === ev.MILITARY && segF.topicGapType === "episode" && segF.proposal === null && (await usage()) === u2, startF);

  // 입구 — 입장 때(initFreeChatAction) 오래된 구간을 먼저 닫고 상태를 돌려준다(옛 대기 대화 이어받기는 2026-11-03 테이블과 함께 삭제).
  const action = read("app/actions/free-chat.ts");
  check("⑮ 입장 액션 = 오래된 구간 닫기 → 상태",
    /await closeIdleSegment\(userId\);\n\s*return getFreeChatState\(userId\);/.test(action) && !action.includes("adoptLegacyPending("));
}

const FAREWELL = /(들려주셔서|고마워요|고맙습니다|감사|잘 들었|즐거웠|다음에 또|안녕히)/;

// 운영 test30 E2E 같은 문장 재현(실제 Haiku·Sonnet) — 두 번째 제안에 첫 이야기 미포함·중학교 시기 유지·장소 추출·작별 인사 없음·제목 표시.
async function liveE2EReplay() {
  liveConversation = [];
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
      !!c1 && !!c1.center && "id" in c1.center && c1.center.id === ev.MIDDLE_SCHOOL && c1.people.some((x) => x.name.includes("정우")) &&
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
    check("F 실제 — 두 번째 카드 시기 = 중학교 입학 유지(3)", !!c2 && !!c2.center && "id" in c2.center && c2.center.id === ev.MIDDLE_SCHOOL, c2?.center);
    if (second?.propose) check("F 실제 — 두 번째 제안 턴 응답도 작별 인사 아님(5)", !FAREWELL.test(second.reply), second.reply);
    // [안 만들기] 뒤 대화 계속 — 안 만든 내용은 구간에서 빠짐.
    if (c2) await declineFreeChatProposal(userId);
    await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "assistant", content: FREE_CHAT_COPY.declined } });
    await sleep(5);
    const r3 = await say1("정우가 물고기를 더 많이 잡았어요");
    check("F 실제 — [안 만들기] 뒤 계속: 새 구간 실질 1턴(안 만든 두 턴·안내문 제외)", r3.kind === "reply" && r3.segmentTurns === 1, r3);
    // 제목 추론 금지(2026-11-02 — 운영 test30: 이 한 줄로 만든 카드 제목이 "정우보다 적게 잡은 물고기") — [지금 이야기 남기기]와
    // 같은 호출로 카드를 만들어 제목에 원문에 없는 비교·추론이 없는지. 실패하면 입력(구간 대화)·출력(카드)을 파일로 남긴다.
    const p3 = await proposeFromSegment(userId);
    const stored3 = parseCard((await prisma.chatV3Segment.findUnique({ where: { userId }, select: { proposal: true } }))?.proposal);
    const title3 = stored3?.title ?? "";
    const titleOk = p3.kind === "card" && !!stored3 && !/(보다|적게|적은|덜|못|졌|아쉬|부러|이긴|지고)/.test(title3) && /(정우|물고기)/.test(title3);
    console.log("   남은 한 줄 카드 제목:", JSON.stringify(title3));
    if (!titleOk) {
      const file = path.join(os.tmpdir(), `lifebook-title-inference-${Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify({ input: stored3?.transcript ?? null, output: stored3 ?? p3 }, null, 1));
      console.log("   제목 검사 실패 — 입출력:", file);
    }
    check("F 실제 — 남은 한 줄(\"정우가 물고기를 더 많이 잡았어요\") 카드 제목에 원문에 없는 비교·추론 없음", titleOk, title3);
    if (p3.kind === "card") await declineFreeChatProposal(userId);
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

// ⑦ 확인 대기를 만드는 경로 0 — 이 실행에서 카드 [만들기]·[고치기]·되묻기·자유 대화(실제 모델 포함)·직접 저장을 다 거친 뒤
// 이 계정에 확인 대기 연결(PROPOSED)·초안 인물이 없다(2026-11-03, 파일 안 호출 검색 대신 실제 DB). ⑪ 이 잠깐 만든 것은 지웠다.
async function noPendingChecks(fx: Fixture) {
  const [proposed, drafts] = await Promise.all([
    prisma.nodeLink.count({ where: { userId: fx.userId, status: "PROPOSED" } }),
    prisma.person.count({ where: { userId: fx.userId, isDraft: true } }),
  ]);
  check("⑦ 확인 대기를 만드는 경로 0 — 모든 저장 뒤 확인 대기 연결·초안 인물 0", proposed === 0 && drafts === 0, { proposed, drafts });
}

async function main() {
  pureChecks();
  staticChecks();
  josaChecks();
  longTitleChecks();
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
    await materialChecks(fx);
    await referenceChecks(fx);
    await titleChecks(fx);
    await periodTitleGuardChecks(fx);
    await leftoverChecks(fx);
    await centerLabelChecks(fx);
    await budgetChecks(fx);
    await requireTestBudget("test-chat-proposal");
    await liveBasic(fx);
    if (LIVE) {
      await requireTestBudget("test-chat-proposal --live");
      await liveScenarios(fx);
      await liveE2EReplay();
      await liveMaterialAndPlaces();
      await liveReferences();
    }
    await noPendingChecks(fx);
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
