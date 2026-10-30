// 오늘의 인터뷰 1차 회귀(docs/phase/today-interview.md). 실행: npx tsx db/test-interview.ts
//
//   ① 접근 — 로그인 V3 전원(허용 목록 게이트 없음). 정적 검사: 액션 첫 줄 비로그인 throw·page 분기·
//      진입 카드 항상 표시·게이트 잔재 0·proxy 무접촉
//   ② 세션 생성 — 계획 고정·출처 혼합·하루 1세션(두 번 시작해도 한 벌)
//   ③ 이어하기 — 다시 들어와도 같은 문항, 이미 본 문항이 있으면 resumed
//   ④ 연도(실제 Sonnet 1회) — year 만 채움, status·correctedYear·unclearCount 무변, AI 사용량 기록
//   ⑤ 이야기(실제 Sonnet 후속 1 + 요약 1~2 + 인물 추출 1) — Episode(구간 아님·풀 제목) + AI 사용량
//   ⑥ 그사이 채워진 문항은 DROPPED, 종료 요약·진입 카드
//   ⑦ 중복 질문 미출제 — 다음 날·8일 뒤 계획, 재노출 규칙(Q4·Q5) 순수 함수, 풀 대상 시기
//   ⑧ LifeEvent.status SKIPPED 값 미사용 — DB 스냅샷 전후 동일 + 정적 검사
//   ⑨ 풀 문구 {elemSchool} — 출생연도 기준 국민학교/초등학교 치환(+ 조사), 1960년생 픽스처 제목
//   ⑩ 관계별 나(노드 그래프 2a, 실제 Sonnet 요약 1~2 + 인물 추출 1) — 출제(최대 1개·관계 대상 이름
//      치환), Episode(kind=SELF) 저장, 이야기 ↔ 인물 확정 연결, 이야기 갭·배지 미충족, 포스터 브릿지
//      제외, /story-review 별도 묶음, 순수 함수(키·후보·재노출·최대 1개·{who} 치환)
//
// 자체 픽스처 계정(fixture-interview@lifebook.invalid)을 시작 시 만들고 끝에(성공·실패
// 모두) deleteAccountTx 로 하위 데이터째 삭제한다. test30·실고객 계정 읽기·쓰기 0.
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge } from "../lib/episode";
import { detectGaps } from "../lib/gap-detector";
import { kstDay, parseSelfKeyId, selfKeyId } from "../lib/interview/keys";
import {
  computeTodayPlan,
  isEligible,
  pickPlan,
  poolCandidates,
  selfCandidates,
  type PlanCandidate,
  type PlanHistoryRow,
} from "../lib/interview/plan";
import { elemSchoolName, renderPoolText } from "../lib/interview/pool-text";
import {
  QUESTION_POOL,
  SELF_QUESTION_POOL,
  type InterviewPoolQuestion,
  type InterviewSelfQuestion,
} from "../lib/interview/question-pool";
import { syncV3Bridge } from "../lib/poster/v3-bridge";
import { getStoryReviewData } from "../lib/story-review";
import {
  answerInterviewYear,
  finishInterviewStory,
  getInitialInterviewState,
  getInterviewCardState,
  interviewStoryTurn,
  nextInterviewState,
  skipInterviewItem,
  startInterviewSession,
  type InterviewState,
} from "../lib/interview/session";
import { isUnknownYearAnswer, parseYearDeterministic } from "../lib/interview/year";
import type { LifeEventType } from "../lib/generated/prisma/enums";

const FIXTURE_EMAIL = "fixture-interview@lifebook.invalid";
const ROOT = path.resolve(__dirname, "..");
const DAY_MS = 86_400_000;

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

// "use server" 파일의 export 함수 → 첫 문장 텍스트(test-lab-gate.ts 와 같은 방식).
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

function itemOf(state: InterviewState) {
  return state.kind === "item" ? state.item : null;
}

async function removeFixture(): Promise<void> {
  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
}

// 1960년생 V3 사용자. 골격 확정(대학은 SKIPPED=해당 없음), 첫 직장·결혼은 연도 없음.
// 고등학교 사건에 확정 인물 1명 연결(관계별 나 linked 문항 대상).
async function seedFixture(): Promise<{ userId: string; ev: Record<string, string>; friendId: string }> {
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: FIXTURE_EMAIL,
      name: "[fixture] interview",
      birthYear: 1960,
      onboardingTrack: "V3",
      termsConsentAt: now,
      privacyConsentAt: now,
      overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({
    data: { userId: user.id, birthYear: 1960, region: "부산", skeletonGeneratedAt: now },
  });
  const rows: [LifeEventType, string, number | null, "CONFIRMED" | "SKIPPED"][] = [
    ["BIRTH", "출생", 1960, "CONFIRMED"],
    ["ELEM_SCHOOL", "국민학교 입학", 1967, "CONFIRMED"],
    ["MIDDLE_SCHOOL", "중학교 입학", 1973, "CONFIRMED"],
    ["HIGH_SCHOOL", "고등학교 입학", 1976, "CONFIRMED"],
    ["UNIVERSITY", "대학교 입학", 1979, "SKIPPED"],
    ["MILITARY", "군 입대", 1980, "CONFIRMED"],
    ["FIRST_JOB", "첫 직장", null, "CONFIRMED"],
    ["MARRIAGE", "결혼", null, "CONFIRMED"],
  ];
  const ev: Record<string, string> = {};
  for (const [i, [type, label, year, status]] of rows.entries()) {
    const e = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type,
        label,
        year,
        isOptional: ["UNIVERSITY", "MILITARY", "FIRST_JOB", "MARRIAGE"].includes(type),
        status,
        confirmedAt: status === "CONFIRMED" ? now : null,
        sequenceOrder: i,
        personAsked: true,
      },
      select: { id: true },
    });
    ev[type] = e.id;
  }
  const friend = await prisma.person.create({
    data: { userId: user.id, name: "박영수", relation: "고등학교 친구" },
    select: { id: true },
  });
  await prisma.personLifeEvent.create({ data: { personId: friend.id, lifeEventId: ev.HIGH_SCHOOL, userId: user.id } });
  return { userId: user.id, ev, friendId: friend.id };
}

function staticChecks() {
  // ① 액션 비로그인 거부 — 모든 export 액션 첫 줄이 requireUserId(), 그 함수는 auth() 후 userId 없으면 throw.
  const actionsSrc = read("app/interview/actions.ts");
  const actions = exportedFirstStatements("app/interview/actions.ts");
  check("① 서버 액션 5개 존재", actions.length === 5, actions.map((a) => a.name));
  for (const a of actions) {
    check(`① 액션 ${a.name} 첫 줄 = requireUserId()`, /^const userId = await requireUserId\(\);$/.test(a.first), a.first);
  }
  check(
    "① requireUserId = auth() 후 비로그인 throw",
    /async function requireUserId\(\): Promise<string> \{\s*const session = await auth\(\);\s*const userId = session\?\.user\?\.id;\s*if \(!userId\) throw new Error\("Unauthorized"\);\s*return userId;\s*\}/.test(
      actionsSrc,
    ),
  );
  // ① 화면 분기는 그대로 — 비로그인 /login · V2 /enter · 재동의 /consent · 골격 미완성 /chat-v3.
  const pageSrc = read("app/interview/page.tsx");
  check(
    "① page.tsx 분기(/login·/enter·/consent·/chat-v3)",
    ["/login", "/enter", "/consent", "/chat-v3"].every((p) => pageSrc.includes(`redirect("${p}")`)),
  );
  const reviewSrc = read("app/story-review/page.tsx");
  check(
    "① /story-review 진입 카드 항상 조회·표시(조건 없음)",
    /getPendingChatContext\(userId\),\s*getInterviewCardState\(userId\),\s*\]\)/.test(reviewSrc) &&
      reviewSrc.includes("<InterviewCard state={interviewCard} />"),
  );
  const gateLeft = ["app", "lib"]
    .flatMap((dir) => walk(path.join(ROOT, dir)))
    .filter((file) => /INTERVIEW_ALLOWED_USER_IDS|interview\/gate|interview\/access/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(ROOT, file));
  check(
    "① 허용 목록 게이트 잔재 0(app·lib, layout 없음)",
    gateLeft.length === 0 && !fs.existsSync(path.join(ROOT, "app/interview/layout.tsx")),
    gateLeft,
  );
  check("① proxy.ts 에 /interview 언급 없음(무접촉)", !read("proxy.ts").includes("interview"));

  // ⑧ 인터뷰 코드의 LifeEvent 쓰기는 연도 1곳뿐이고 data 는 { year } 만.
  const files = ["lib/interview/session.ts", "lib/interview/plan.ts", "lib/interview/year.ts", "app/interview/actions.ts", "app/interview/page.tsx"];
  const src = files.map(read).join("\n");
  const writes = src.match(/lifeEvent\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? [];
  check("⑧ 인터뷰 코드의 LifeEvent 쓰기 = 1곳", writes.length === 1, writes);
  check("⑧ 그 쓰기의 data = { year } 만", /lifeEvent\.updateMany\(\{[\s\S]{0,200}data:\s*\{\s*year\s*\}/.test(src));

  // ⑩ /story-review — 그때의 나 묶음을 따로 그리고 제목은 문구 파일에서.
  check("⑩ /story-review 그때의 나 묶음 = selfEpisodes + 문구 파일 제목", reviewSrc.includes("selfEpisodes.length > 0") && reviewSrc.includes("INTERVIEW_COPY.selfStoriesTitle"));
}

function pureChecks() {
  // ⑨ 풀 문구 {elemSchool} — 출생연도 기준 국민학교/초등학교(입학 = 출생+7, 1996 개칭).
  check("⑨ 1958년생 → 국민학교", renderPoolText("{elemSchool} 시절 놀이", 1958) === "국민학교 시절 놀이");
  check("⑨ 2001년생 → 초등학교", renderPoolText("{elemSchool} 다닐 때", 2001) === "초등학교 다닐 때");
  check("⑨ 출생연도 없음 → 초등학교", renderPoolText("{elemSchool} 시절", null) === "초등학교 시절");
  check("⑨ 경계: 1988년생(1995 입학) 국민 / 1989년생(1996 입학) 초등", elemSchoolName(1988) === "국민학교" && elemSchoolName(1989) === "초등학교");
  check("⑨ 조사 {elemSchool:은/는} → josa 유틸", renderPoolText("{elemSchool:은/는} 어땠어요?", 1958) === "국민학교는 어땠어요?");
  check("⑨ 모르는 조사 쌍은 그대로 둠", renderPoolText("{elemSchool:요/오}", 1958) === "{elemSchool:요/오}");
  check("⑨ 풀 예시 elem-play 질문·제목에 자리표시", (() => {
    const q = QUESTION_POOL.find((p) => p.id === "elem-play");
    return !!q && q.text.includes("{elemSchool}") && q.topic.includes("{elemSchool}");
  })());

  // ④ 연도 해석(정규식 — AI 0회).
  const now = new Date("2026-10-25T00:00:00Z");
  check("④ '85년도요' → 1985", parseYearDeterministic("85년도요", 1960, now) === 1985);
  check("④ '2003년' → 2003", parseYearDeterministic("2003년", 1960, now) === 2003);
  check("④ '12년' → 2012(1912 는 출생 전)", parseYearDeterministic("12년", 1960, now) === 2012);
  check("④ 출생 전 '1950' → null", parseYearDeterministic("1950년", 1960, now) === null);
  check("④ 나이 표현은 정규식이 안 함 → null", parseYearDeterministic("스물여섯 살 때요", 1960, now) === null);
  check("④ '기억이 안 나요' = 모름", isUnknownYearAnswer("기억이 안 나요") && isUnknownYearAnswer("잘 모르겠어요"));

  // ⑦ 재노출 규칙(Q4·Q5).
  const h = (itemKey: string, status: string, day: string, refId: string | null = "x"): PlanHistoryRow => ({ itemKey, status, day, refId });
  const k = "gap:episode:e1";
  check("⑦ 기록 없음 → 출제 가능", isEligible(k, "GAP_EPISODE", [], "2026-11-01"));
  check("⑦ 건너뜀 1회 → 6일 뒤 X", !isEligible(k, "GAP_EPISODE", [h(k, "SKIPPED", "2026-11-01")], "2026-11-07"));
  check("⑦ 건너뜀 1회 → 7일 뒤 O", isEligible(k, "GAP_EPISODE", [h(k, "SKIPPED", "2026-11-01")], "2026-11-08"));
  const two = [h(k, "SKIPPED", "2026-11-01"), h(k, "SKIPPED", "2026-11-08")];
  check("⑦ 건너뜀 2회 → 29일 뒤 X", !isEligible(k, "GAP_EPISODE", two, "2026-12-07"));
  check("⑦ 건너뜀 2회 → 30일 뒤 O", isEligible(k, "GAP_EPISODE", two, "2026-12-08"));
  const three = [...two, h(k, "SKIPPED", "2026-12-08")];
  check("⑦ 건너뜀 3회 → 영구 제외", !isEligible(k, "GAP_EPISODE", three, "2027-12-01"));
  check("⑦ 같은 날·미래 기록은 안 봄", isEligible(k, "GAP_EPISODE", [h(k, "SKIPPED", "2026-11-01")], "2026-11-01"));
  check("⑦ DROPPED·PLANNED 는 영향 없음", isEligible(k, "GAP_EPISODE", [h(k, "DROPPED", "2026-11-01"), h(k, "PLANNED", "2026-11-02")], "2026-11-03"));
  check("⑦ 답했지만 갭이 남은 이야기 → 7일", !isEligible(k, "GAP_EPISODE", [h(k, "ANSWERED", "2026-11-01")], "2026-11-07") && isEligible(k, "GAP_EPISODE", [h(k, "ANSWERED", "2026-11-01")], "2026-11-08"));
  const p = "pool:elem-play";
  check("⑦ 답한 풀 질문 → 영구 제외", !isEligible(p, "POOL", [h(p, "ANSWERED", "2026-11-01")], "2027-11-01"));
  const y = "gap:year:e2";
  check("⑦ 연도 모름 1회 → 13일 X / 14일 O", !isEligible(y, "GAP_YEAR", [h(y, "ANSWERED", "2026-11-01", null)], "2026-11-14") && isEligible(y, "GAP_YEAR", [h(y, "ANSWERED", "2026-11-01", null)], "2026-11-15"));
  check("⑦ 연도 모름 2회 → 영구 제외", !isEligible(y, "GAP_YEAR", [h(y, "ANSWERED", "2026-11-01", null), h(y, "ANSWERED", "2026-11-15", null)], "2027-11-01"));

  // ⑦ 풀 대상 시기 — 확정 사건 없는 시기(SKIPPED 대학 등)·대상 시기 없음·꺼진 질문은 안 나감.
  const q = (id: string, anchor: LifeEventType | null, enabled = true): InterviewPoolQuestion => ({
    id, text: "t", topic: "t", category: "daily", anchor, followUp: false, order: 1, enabled,
  });
  const confirmed = new Map<LifeEventType, readonly string[]>([["ELEM_SCHOOL", ["ev-elem"]]]);
  const pc = poolCandidates([q("a", "ELEM_SCHOOL"), q("b", "UNIVERSITY"), q("c", null), q("d", "ELEM_SCHOOL", false)], confirmed);
  check("⑦ 풀: 확정 시기만·대상 시기 필수·enabled 만", pc.length === 1 && pc[0].itemKey === "pool:a" && pc[0].eventId === "ev-elem", pc);

  // ⑩ 관계별 나 — 순수 함수.
  check("⑩ {who:과/와} 받침 없음 → 와 / 받침 있음 → 과", renderPoolText("{who:과/와} 같이", null, "박영수") === "박영수와 같이" && renderPoolText("{who:과/와} 같이", null, "김철") === "김철과 같이");
  check("⑩ {who} 이름 그대로 · who 없으면 자리표시 유지", renderPoolText("{who} 앞에서", null, "선생님") === "선생님 앞에서" && renderPoolText("{who} 앞에서", 1960) === "{who} 앞에서");
  check("⑩ {elemSchool}·{who} 함께 치환", renderPoolText("{elemSchool} 다닐 때 {who} 앞", 1960, "선생님") === "국민학교 다닐 때 선생님 앞");
  const rel = { type: "PERSON" as const, id: "p1" };
  check("⑩ 문항 키 왕복(범주·인물·그룹)",
    JSON.stringify(parseSelfKeyId(selfKeyId("q", "e1", null))) === JSON.stringify({ questionId: "q", lifeEventId: "e1", relation: null }) &&
      JSON.stringify(parseSelfKeyId(selfKeyId("q", "e1", rel))) === JSON.stringify({ questionId: "q", lifeEventId: "e1", relation: rel }) &&
      parseSelfKeyId(selfKeyId("q", "e1", { type: "PERSON_GROUP", id: "g1" }))?.relation?.type === "PERSON_GROUP" &&
      selfKeyId("q", "e1", rel) === "q:e1:person:p1");
  check("⑩ 잘못된 키 → null", ["q", "q:e1:x:p1", "q::person:p1", "q:e1:person"].every((k2) => parseSelfKeyId(k2) === null));
  const sq = (id: string, anchor: LifeEventType, relation: InterviewSelfQuestion["relation"], enabled = true, order = 1): InterviewSelfQuestion => ({
    id, text: "t", topic: "t", anchor, relation, followUp: false, order, enabled,
  });
  const events = new Map<LifeEventType, readonly string[]>([["HIGH_SCHOOL", ["ev-high", "ev-high2"]], ["ELEM_SCHOOL", ["ev-elem"]]]);
  const relations = new Map([["ev-high", [rel, { type: "PERSON_GROUP" as const, id: "g1" }]], ["ev-high2", [{ type: "PERSON" as const, id: "p9" }]]]);
  const sc = selfCandidates(
    [
      sq("linked", "HIGH_SCHOOL", { kind: "linked" }, true, 2),
      sq("cat", "ELEM_SCHOOL", { kind: "category", label: "선생님" }, true, 1),
      sq("off", "ELEM_SCHOOL", { kind: "category", label: "가족" }, false),
      sq("nojob", "FIRST_JOB", { kind: "category", label: "가족" }),
      sq("norel", "ELEM_SCHOOL", { kind: "linked" }, true, 3),
    ],
    events,
    relations,
  );
  check("⑩ 후보: 범주 1개·linked 는 첫 사건의 관계 대상마다·확정 시기만·enabled 만·순서대로",
    JSON.stringify(sc.map((c) => c.itemKey)) === JSON.stringify(["self:cat:ev-elem", "self:linked:ev-high:person:p1", "self:linked:ev-high:group:g1"]) &&
      sc.every((c) => c.source === "SELF") && sc[1].eventId === "ev-high",
    sc);
  const sk = "self:cat:ev-elem";
  check("⑩ 답한 관계별 나 → 영구 제외 / 건너뜀 1회 → 7일", !isEligible(sk, "SELF", [h(sk, "ANSWERED", "2026-11-01")], "2027-11-01") &&
    !isEligible(sk, "SELF", [h(sk, "SKIPPED", "2026-11-01")], "2026-11-07") && isEligible(sk, "SELF", [h(sk, "SKIPPED", "2026-11-01")], "2026-11-08"));
  const cand = (key: string, source: PlanCandidate["source"], category?: "taste" | "daily"): PlanCandidate => ({ itemKey: key, source, eventId: key, category });
  const base = {
    years: [cand("y1", "GAP_YEAR")],
    gaps: [cand("g1", "GAP_EPISODE"), cand("g2", "GAP_EPISODE")],
    pools: [cand("p1", "POOL", "daily"), cand("p2", "POOL", "taste"), cand("p3", "POOL", "daily")],
  };
  const noSelf = pickPlan({ ...base, selves: [] }, [], "2026-11-01").map((c) => c.itemKey);
  const withSelf = pickPlan({ ...base, selves: [cand("s1", "SELF"), cand("s2", "SELF"), cand("s3", "SELF")] }, [], "2026-11-01").map((c) => c.itemKey);
  check("⑩ 관계별 나 후보가 없으면 기존 순서 그대로(연도·갭·풀·갭·풀·풀)", JSON.stringify(noSelf) === JSON.stringify(["y1", "g1", "p1", "g2", "p2", "p3"]), noSelf);
  check("⑩ 후보가 여럿이어도 6문항 중 1개만, 자리 = 5번째", JSON.stringify(withSelf) === JSON.stringify(["y1", "g1", "p1", "g2", "s1", "p2"]), withSelf);
  const onlySelf = pickPlan({ years: [], gaps: [], pools: [], selves: [cand("s1", "SELF"), cand("s2", "SELF")] }, [], "2026-11-01");
  check("⑩ 다른 후보가 없어도 관계별 나는 1개까지", onlySelf.length === 1 && onlySelf[0].itemKey === "s1", onlySelf);
  check("⑩ 예시 3개 — 범주·linked 둘 다·{elemSchool} 치환 1개 이상",
    SELF_QUESTION_POOL.length === 3 &&
      SELF_QUESTION_POOL.some((q2) => q2.relation.kind === "linked") &&
      SELF_QUESTION_POOL.some((q2) => q2.relation.kind === "category") &&
      SELF_QUESTION_POOL.some((q2) => q2.text.includes("{elemSchool}")) &&
      new Set(SELF_QUESTION_POOL.map((q2) => q2.id)).size === 3);
  const selfBlock = read("lib/interview/question-pool.ts").split("export const SELF_QUESTION_POOL")[1] ?? "";
  check("⑩ 예시 문구에 [임시 — 성민 확정 필요] 표기(질문·제목 6 + 범주 2)", (selfBlock.match(/\[임시 — 성민 확정 필요\]/g) ?? []).length === 8);
}

async function main() {
  staticChecks();
  pureChecks();

  await removeFixture();
  let userId: string | null = null;
  try {
    const seeded = await seedFixture();
    userId = seeded.userId;
    const ev = seeded.ev;
    const friendId = seeded.friendId;
    const selfKey = `self:self-high-linked:${ev.HIGH_SCHOOL}:person:${friendId}`;
    const now = new Date();
    const today = kstDay(now);
    const statusBefore = await prisma.lifeEvent.findMany({ where: { userId }, select: { id: true, status: true }, orderBy: { sequenceOrder: "asc" } });

    // ② 세션 생성.
    const initial = await getInitialInterviewState(userId, now);
    check("② 첫 화면 = 시작(문항 6개 미리보기)", initial.kind === "start" && initial.plannedCount === 6, initial);
    check("② 시작 전엔 행을 만들지 않음", (await prisma.interviewItem.count({ where: { userId } })) === 0);

    const first = await startInterviewSession(userId, now);
    const rows = await prisma.interviewItem.findMany({ where: { userId, day: today }, orderBy: { ordinal: "asc" } });
    const expectedKeys = [
      `gap:year:${ev.FIRST_JOB}`,
      `gap:period:${ev.MILITARY}`,
      "pool:elem-play",
      `gap:episode:${ev.BIRTH}`,
      selfKey,
      "pool:high-song",
    ];
    check("② 계획 = 연도·구간·풀·이야기·관계별 나·풀(정해진 순서)", JSON.stringify(rows.map((r) => r.itemKey)) === JSON.stringify(expectedKeys), rows.map((r) => r.itemKey));
    check("② ordinal 1..6 · 전부 PLANNED", rows.every((r, i) => r.ordinal === i + 1 && r.status === "PLANNED"));
    check("② 같은 세션 안 문항 키 중복 없음", new Set(rows.map((r) => r.itemKey)).size === rows.length);
    check("② 첫 문항 = 연도(1/6)", itemOf(first)?.kind === "year" && itemOf(first)?.ordinal === 1 && itemOf(first)?.total === 6, first);
    await startInterviewSession(userId, now);
    check("② 같은 날 다시 시작해도 한 벌(Q7)", (await prisma.interviewItem.count({ where: { userId } })) === 6);

    // ③ 이어하기 — 다시 들어와도 같은 문항.
    const again = await getInitialInterviewState(userId, now);
    check("③ 재진입 = 같은 문항 + resumed", again.kind === "item" && again.item.id === rows[0].id && again.resumed, again);
    check("③ 문항을 낸 시각 기록(askedAt)", (await prisma.interviewItem.findUnique({ where: { id: rows[0].id } }))?.askedAt != null);

    // ④ 연도 — 실제 Sonnet(나이 표현). 서른두 살(≈1992)로 골라 군 입대(1980)와 10년 넘게
    // 벌어지게 한다 — 군 입대 구간 갭이 그대로 남고 첫 직장 뒤 구간 갭이 새로 생겨 ⑦ 기대값이 고정된다.
    const yr = await answerInterviewYear(userId, rows[0].id, "서른두 살 때였어요", now);
    const firstJob = await prisma.lifeEvent.findUnique({ where: { id: ev.FIRST_JOB } });
    const yrItem = await prisma.interviewItem.findUnique({ where: { id: rows[0].id } });
    check("④ 나이 표현 → 연도 저장(1990~1993)", yr.outcome === "saved" && yr.year >= 1990 && yr.year <= 1993, yr);
    check("④ LifeEvent.year 만 채움(status·correctedYear·unclearCount 무변)",
      firstJob?.year === (yr.outcome === "saved" ? yr.year : -1) && firstJob?.status === "CONFIRMED" && firstJob.correctedYear === null && firstJob.unclearCount === 0 && !firstJob.needsReview,
      firstJob);
    check("④ 문항 ANSWERED·refId=사건", yrItem?.status === "ANSWERED" && yrItem.refId === ev.FIRST_JOB && yrItem.turns === 1);
    check("④ AI 사용량 기록(호출·토큰·모델)", (yrItem?.aiCalls ?? 0) >= 1 && (yrItem?.aiInputTokens ?? 0) > 0 && (yrItem?.aiOutputTokens ?? 0) > 0 && !!yrItem?.aiModel, yrItem);

    // 문항 2(구간) 건너뜀 → 문항 3(풀).
    const afterSkip = await skipInterviewItem(userId, rows[1].id, now);
    check("③ 건너뛰면 다음 문항(3/6)", itemOf(afterSkip)?.id === rows[2].id, afterSkip);

    // ⑤ 이야기 — 실제 Sonnet.
    const question = itemOf(afterSkip)?.question ?? "";
    const a1 = "친구들이랑 고무줄놀이랑 딱지치기를 많이 했어요. 학교 끝나면 해 질 때까지 골목에서 놀았지요.";
    const turn = await interviewStoryTurn(userId, rows[2].id, [{ role: "user", text: a1 }], 0);
    check("⑤ 후속 질문 생성", turn.ok && turn.reply.trim().length > 0, turn);
    const a2 = "그때 같이 놀던 동네 형들이 많았는데 이름은 잘 생각이 안 나요.";
    const transcript = [
      { role: "assistant" as const, text: question },
      { role: "user" as const, text: a1 },
      { role: "assistant" as const, text: turn.ok ? turn.reply : "" },
      { role: "user" as const, text: a2 },
    ];
    const fin = await finishInterviewStory(userId, rows[2].id, transcript, now);
    const storyItem = await prisma.interviewItem.findUnique({ where: { id: rows[2].id } });
    const episode = storyItem?.refId
      ? await prisma.episode.findUnique({ where: { id: storyItem.refId }, include: { memory: { select: { title: true, createdVia: true } } } })
      : null;
    check("⑤ 저장 성공·문항 ANSWERED", fin.ok && storyItem?.status === "ANSWERED", fin);
    check("⑤ Episode = 대상 시기 사건·구간 아님·풀 제목", episode?.lifeEventId === ev.ELEM_SCHOOL && episode.isPeriod === false && episode.memory.title === "국민학교 시절 놀이" && episode.memory.createdVia === "episode" && episode.content.trim().length > 0, episode && { lifeEventId: episode.lifeEventId, isPeriod: episode.isPeriod, title: episode.memory.title });
    check("⑤ 답 턴·글자 수", storyItem?.turns === 2 && storyItem.answerChars === [...a1].length + [...a2].length, storyItem && { turns: storyItem.turns, answerChars: storyItem.answerChars });
    check("⑤ AI 사용량 기록(후속 1 + 요약 ≥1 + 인물 추출 1 ≥ 3회)", (storyItem?.aiCalls ?? 0) >= 3 && (storyItem?.aiInputTokens ?? 0) > 0 && !!storyItem?.aiModel, storyItem && { aiCalls: storyItem.aiCalls, in: storyItem.aiInputTokens, out: storyItem.aiOutputTokens, model: storyItem.aiModel });

    // ⑥ 문항 4(출생 이야기)를 낸 뒤 다른 경로로 채워지면 → 다시 들어올 때 DROPPED.
    const at4 = await nextInterviewState(userId, now);
    check("⑥ 다음 문항 = 4/6(출생 이야기)", itemOf(at4)?.id === rows[3].id, at4);
    await createEpisodeBridge(userId, ev.BIRTH, "출생", 1960, "부산 영도에서 태어나 바닷가 마을에서 자랐다.", "[본인] 부산 영도");
    const at5 = await nextInterviewState(userId, now);
    check("⑥ 그사이 채워진 문항은 DROPPED → 5/6", itemOf(at5)?.id === rows[4].id && (await prisma.interviewItem.findUnique({ where: { id: rows[3].id } }))?.status === "DROPPED", at5);
    check("⑥ 진입 카드 = 진행 중(4/6)", JSON.stringify(await getInterviewCardState(userId, now)) === JSON.stringify({ kind: "progress", done: 4, total: 6 }));

    // ⑩ 관계별 나 — 5/6. 실제 Sonnet(후속 질문 없이 첫 답으로 마무리 — 요약 1~2 + 인물 추출 1).
    const selfQ = itemOf(at5);
    check("⑩ 관계별 나 문항 = 대상 시기(고교)·관계 대상 이름·조사 치환", selfQ?.kind === "story" && selfQ.question === "고등학교 다니실 때, 박영수와 같이 있을 때는 어떤 사람이셨어요?", selfQ);
    const selfAnswer = "그 친구랑 있으면 제가 말이 많아졌어요. 평소엔 조용한 편이었는데 그 친구 앞에서는 장난도 잘 치고 많이 웃었지요.";
    const selfFin = await finishInterviewStory(userId, rows[4].id, [
      { role: "assistant", text: selfQ?.question ?? "" },
      { role: "user", text: selfAnswer },
    ], now);
    const selfItem = await prisma.interviewItem.findUnique({ where: { id: rows[4].id } });
    const selfEp = selfItem?.refId
      ? await prisma.episode.findUnique({ where: { id: selfItem.refId }, include: { memory: { select: { title: true, createdVia: true } } } })
      : null;
    check("⑩ 저장 성공·문항 ANSWERED", selfFin.ok && selfItem?.status === "ANSWERED", selfFin);
    check("⑩ Episode = 그때의 나(SELF)·대상 시기 사건(고교)·구간 아님·제목 치환·대상 인물 칸 비움",
      selfEp?.kind === "SELF" && selfEp.lifeEventId === ev.HIGH_SCHOOL && !selfEp.isPeriod && selfEp.personId === null &&
        selfEp.memory.title === "고등학교 때 박영수와 있을 때의 나" && selfEp.memory.createdVia === "episode" && selfEp.content.trim().length > 0,
      selfEp && { kind: selfEp.kind, lifeEventId: selfEp.lifeEventId, title: selfEp.memory.title, personId: selfEp.personId });
    const selfEpId = selfEp?.id ?? "";
    const selfLinks = await prisma.nodeLink.findMany({
      where: { userId, OR: [{ fromType: "EPISODE", fromId: selfEpId }, { toType: "EPISODE", toId: selfEpId }] },
    });
    check("⑩ 이야기 ↔ 관계 인물 확정 연결 1건(EPISODE→PERSON, CONFIRMED)",
      selfLinks.length === 1 && selfLinks[0].fromType === "EPISODE" && selfLinks[0].fromId === selfEpId &&
        selfLinks[0].toType === "PERSON" && selfLinks[0].toId === friendId && selfLinks[0].status === "CONFIRMED",
      selfLinks);
    const gapsAfterSelf = await detectGaps(userId);
    const highAfter = await prisma.lifeEvent.findUnique({ where: { id: ev.HIGH_SCHOOL }, select: { hasEpisode: true } });
    check("⑩ 갭 미충족 — 고교 이야기 갭 그대로·'이야기 있음' 배지 안 켜짐",
      gapsAfterSelf.some((g) => g.type === "episode" && g.targetEventId === ev.HIGH_SCHOOL) && highAfter?.hasEpisode === false,
      { gaps: gapsAfterSelf.map((g) => `${g.type}:${g.targetEventId}`), highAfter });
    check("⑩ 갭 미충족 — 인물 이야기 갭(박영수)도 그대로", gapsAfterSelf.some((g) => g.type === "person_episode" && g.targetPersonId === friendId));
    const bridgeRows = await syncV3Bridge(userId);
    const highRow = bridgeRows.find((r) => r.id === `v3_${ev.HIGH_SCHOOL}`);
    check("⑩ 포스터 브릿지 — 그때의 나는 본문·구간 행에 안 들어감(고교 = 본문 없음)",
      highRow !== undefined && highRow.content === null &&
        !bridgeRows.some((r) => r.id === `v3p_${selfEpId}` || (!!selfEp && (r.content ?? "").includes(selfEp.content.trim()))),
      highRow);
    const review = await getStoryReviewData(userId);
    check("⑩ /story-review — 그때의 나는 별도 묶음, 일반 이야기 목록엔 없음",
      JSON.stringify(review.selfEpisodes.map((e) => e.id)) === JSON.stringify([selfEpId]) &&
        review.selfEpisodes[0]?.label === "고등학교 때 박영수와 있을 때의 나" &&
        !review.episodes.some((e) => e.id === selfEpId) && review.episodes.length === 2,
      { self: review.selfEpisodes.map((e) => e.label), stories: review.episodes.map((e) => e.label) });

    const summary = await skipInterviewItem(userId, rows[5].id, now);
    check("⑥ 마지막 뒤 = 종료 요약(답 3·건너뜀 2)", summary.kind === "summary" && summary.answered === 3 && summary.skipped === 2, summary);
    check("⑥ 요약 목록 = 연도 사건·이야기 제목·관계별 나 제목", summary.kind === "summary" && summary.saved.length === 3 && summary.saved.some((s) => s.includes("첫 직장")) && summary.saved.includes("국민학교 시절 놀이") && summary.saved.includes("고등학교 때 박영수와 있을 때의 나"), summary);
    check("⑥ 진입 카드 = 오늘 완료", (await getInterviewCardState(userId, now)).kind === "done");
    check("⑥ 완료 후 다시 들어와도 요약(새 세션 없음)", (await getInitialInterviewState(userId, now)).kind === "summary" && (await prisma.interviewItem.count({ where: { userId } })) === 6);

    // ⑦ 중복 질문 미출제 — 다음 날.
    const tomorrow = kstDay(new Date(now.getTime() + DAY_MS));
    const planTomorrow = (await computeTodayPlan(userId, tomorrow)).map((c) => c.itemKey);
    const expectTomorrow = [
      `gap:year:${ev.MARRIAGE}`,
      `gap:period:${ev.FIRST_JOB}`,
      "pool:middle-lunchbox",
      `gap:episode:${ev.MIDDLE_SCHOOL}`,
      `self:self-elem-teacher:${ev.ELEM_SCHOOL}`,
      "pool:firstjob-payday",
    ];
    check("⑦ 다음 날 = 답한·건너뛴·채워진 것 빼고(결혼 연도·첫 직장 이후·중학 도시락·중학·관계별 나(선생님)·첫 월급)", JSON.stringify(planTomorrow) === JSON.stringify(expectTomorrow), planTomorrow);
    const todayDone = rows.filter((r) => r.ordinal !== 4).map((r) => r.itemKey);
    check("⑦ 다음 날 계획에 오늘 답·건너뜀 문항 0개", planTomorrow.every((k2) => !todayDone.includes(k2)));
    const plan8 = (await computeTodayPlan(userId, kstDay(new Date(now.getTime() + 8 * DAY_MS)))).map((c) => c.itemKey);
    check("⑦ 8일 뒤 = 1회 건너뛴 구간 다시 나옴, 답한 풀·관계별 나는 계속 제외", plan8.includes(`gap:period:${ev.MILITARY}`) && !plan8.includes("pool:elem-play") && !plan8.includes(selfKey), plan8);

    // ⑧ SKIPPED 값 미사용 — 상태 스냅샷 동일.
    const statusAfter = await prisma.lifeEvent.findMany({ where: { userId }, select: { id: true, status: true }, orderBy: { sequenceOrder: "asc" } });
    check("⑧ LifeEvent.status 전후 동일(SKIPPED 는 원래 대학 1건뿐)",
      JSON.stringify(statusBefore) === JSON.stringify(statusAfter) && statusAfter.filter((s) => s.status === "SKIPPED").length === 1,
      statusAfter);
  } finally {
    await removeFixture();
    const id = userId ?? "";
    const [user, items, events, eps] = await Promise.all([
      prisma.user.count({ where: { email: FIXTURE_EMAIL } }),
      prisma.interviewItem.count({ where: { userId: id } }),
      prisma.lifeEvent.count({ where: { userId: id } }),
      prisma.episode.count({ where: { lifeEvent: { userId: id } } }),
    ]);
    check("정리 — 픽스처 계정·InterviewItem·하위 데이터 0", user + items + events + eps === 0, { user, items, events, eps });
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
