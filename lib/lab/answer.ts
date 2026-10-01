// 기억 에이전트 연구 트랙 — 답변 검증기 (R2-2, 순수 함수 · DB·LLM 0).
// phase/기억에이전트_R1-R4_기획.md §5. 에이전트(lib/lab/agent.ts)가 submit_answer 로 받은 답을
// 저장·표시하기 전에 반드시 이 함수를 거친다.
//
// ── 주장(claim)의 정의 ─────────────────────────────────────────────
// R2 기준 "근거 없는 주장 비율"(LAB_CRITERIA.R2.unsupportedClaimRateMax)의 분모·분자를 정한다.
//   주장 1개 = 모델이 낸 claims[] 원소 1개, 또는 conflicts[].sides[] 원소 1개.
//              (원소 하나 = 사실 하나를 담은 한 문장, 200자 상한.)
//   분모 submittedClaims = 제출된 claims 수 + 모든 conflicts 의 sides 수.
//   각 주장은 근거 카드 id(c1, c2 …)를 1개 이상 달아야 한다. 근거로 인정되는 id 는
//   "이번 실행에서 도구가 실제로 돌려준 카드"이면서 "검증 시점에 살아 있는 카드"뿐이다
//   (cardFor 가 둘 다 판정). 인정되지 않은 id 는 지우고(droppedCitations), 남은 근거가
//   0개인 주장은 버린다 → 분자 droppedClaims.
//   비율 = droppedClaims / submittedClaims.
// ── 인용 없는 문장 ─────────────────────────────────────────────────
// 모델에게는 "사실을 담은 인용 없는 문장"을 낼 자리가 없다. 허용되는 자유 텍스트는
//   conflicts[].topic(주제명, 30자) · noRecord.topic(30자) · noRecord.followUpQuestion 뿐이고,
//   셋 다 주장이 아니라 분모에 들어가지 않는다.
// 인사·맞장구·연결 말("서로 다른 기록이 있어요", "아직 들려주신 적 없는 이야기예요")은
//   코드가 고정 문구로 붙인다 — 화면 문장(text)은 전부 이 함수가 조립한다.
// ── 후속 질문 규칙(2026-10-01 확정, R2-2 실호출 관찰 반영) ─────────────
//   followUpQuestion 은 정확히 1문장 · 물음표로 끝남 · 60자 이하. 질문 속 연도(4자리 숫자
//   또는 'NN년')와 화자 기록의 인물 이름은 이번 실행에서 조회한 카드·인물에 나온 것이어야 한다.
//   하나라도 어기면 그 질문만 버린다(stats.followUpRejected 에 이유) — 답(주장·기록 없음
//   고정 문구)은 유지하고, 대체 질문을 넣지 않는다.
//   한계: 인명 대조는 화자 기록(Person)에 있는 이름만 가능 — 기록 어디에도 없는 이름을
//   지어내는 경우는 형태소 분석 없이 잡지 못한다.
// ── 그 밖의 규칙 ───────────────────────────────────────────────────
//   - 모순(conflicts)에서 살아남은 근거 있는 쪽이 2개 미만이면 모순이 아니다 → 1개면 일반
//     주장으로 옮기고(conflictsDemoted), 0개면 버린다.
//   - 남은 주장·모순·기록 없음이 하나도 없으면 "기록 없음"으로 떨어진다(fallbackNoRecord).

import { withJosa } from "../josa";

export const CLAIM_MAX = 200;
export const TOPIC_MAX = 30;
export const FOLLOW_UP_MAX = 60;
// 모델이 아무것도 제출하지 않았을 때(fallbackNoRecord)만 코드가 붙이는 고정 질문.
export const DEFAULT_FOLLOW_UP = "혹시 그때 이야기를 조금 더 들려주시겠어요?";
const NO_RECORD = "아직 들려주신 적 없는 이야기예요.";

// 후속 질문 대조 재료 — 에이전트가 이번 실행의 도구 결과로 채운다.
export type FollowUpContext = {
  retrievedText: string; // 이번 실행 도구 결과(JSON)를 이어 붙인 것
  retrievedRanges: { from: number; to: number }[]; // 받은 카드·골격의 연도 구간
  knownNames: string[]; // 화자 기록(Person)의 이름 전체
  currentYear: number; // 'NN년' 해석 기준
};
const EMPTY_FOLLOW_UP_CONTEXT: FollowUpContext = {
  retrievedText: "",
  retrievedRanges: [],
  knownNames: [],
  currentYear: new Date().getFullYear(),
};

// 위반 이유를 돌려준다(통과면 null).
export function checkFollowUp(q: string, ctx: FollowUpContext): string | null {
  if (!q) return "empty";
  if (!/\?$/.test(q)) return "no_question_mark";
  if (q.length > FOLLOW_UP_MAX) return "too_long";
  if (q.split(/[.!?]+/).filter((s) => s.trim() !== "").length > 1) {
    return "multi_sentence";
  }
  const years = [
    ...[...q.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => Number(m[1])),
    ...[...q.matchAll(/(?<!\d)(\d{2})년/g)].map((m) => {
      const n = Number(m[1]);
      return n <= ctx.currentYear % 100 ? 2000 + n : 1900 + n;
    }),
  ];
  for (const y of years) {
    const seen =
      ctx.retrievedText.includes(String(y)) ||
      ctx.retrievedRanges.some((r) => r.from <= y && y <= r.to);
    if (!seen) return "unretrieved_year";
  }
  for (const name of ctx.knownNames) {
    if (
      name.length >= 2 &&
      q.includes(name) &&
      !ctx.retrievedText.includes(name)
    ) {
      return "unretrieved_name";
    }
  }
  return null;
}

export type VerifiedClaim = {
  text: string;
  cardIds: string[];
  cites: number[];
};

export type VerifiedAnswer = {
  text: string; // 화면에 보이는 답(코드가 조립)
  claims: VerifiedClaim[];
  conflicts: { topic: string; sides: VerifiedClaim[] }[];
  noRecord: { topic: string; followUpQuestion: string | null } | null;
  citations: { n: number; cardId: string }[];
  stats: {
    submittedClaims: number;
    droppedClaims: number;
    droppedCitations: number;
    conflictsDemoted: number;
    fallbackNoRecord: boolean;
    followUpRejected: string | null; // 버린 후속 질문의 이유(checkFollowUp)
  };
};

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// cardFor(alias) → 근거로 인정되는 실제 카드 id, 아니면 null.
// followUpCtx 를 안 주면 대조 재료가 비어 연도·인명이 든 후속 질문은 전부 버린다(안전 기본값).
export function verifyAnswer(
  raw: unknown,
  cardFor: (alias: string) => string | null,
  followUpCtx: FollowUpContext = EMPTY_FOLLOW_UP_CONTEXT,
): VerifiedAnswer {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const stats: VerifiedAnswer["stats"] = {
    submittedClaims: 0,
    droppedClaims: 0,
    droppedCitations: 0,
    conflictsDemoted: 0,
    fallbackNoRecord: false,
    followUpRejected: null,
  };

  // 주장 1개 검증 — 인정 근거가 0개면 null.
  const verifyClaim = (c: unknown): Omit<VerifiedClaim, "cites"> | null => {
    stats.submittedClaims += 1;
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const text = clean(o.text, CLAIM_MAX);
    const ids: string[] = [];
    for (const a of asArray(o.cardIds)) {
      const id = typeof a === "string" ? cardFor(a.trim()) : null;
      if (id === null) stats.droppedCitations += 1;
      else if (!ids.includes(id)) ids.push(id);
    }
    if (!text || ids.length === 0) {
      stats.droppedClaims += 1;
      return null;
    }
    return { text: /[.!?]$/.test(text) ? text : `${text}.`, cardIds: ids };
  };

  const claims = asArray(r.claims)
    .map(verifyClaim)
    .filter((c): c is Omit<VerifiedClaim, "cites"> => c !== null);

  const conflicts: { topic: string; sides: Omit<VerifiedClaim, "cites">[] }[] =
    [];
  for (const c of asArray(r.conflicts)) {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const sides = asArray(o.sides)
      .map(verifyClaim)
      .filter((s): s is Omit<VerifiedClaim, "cites"> => s !== null);
    if (sides.length >= 2) {
      conflicts.push({ topic: clean(o.topic, TOPIC_MAX) || "이 일", sides });
    } else if (sides.length === 1) {
      claims.push(sides[0]);
      stats.conflictsDemoted += 1;
    }
  }

  let noRecord: VerifiedAnswer["noRecord"] = null;
  if (r.noRecord && typeof r.noRecord === "object") {
    const o = r.noRecord as Record<string, unknown>;
    // 길이 판정 전에 자르지 않는다(61자 질문이 60자로 잘려 통과하지 않게).
    const q =
      typeof o.followUpQuestion === "string"
        ? o.followUpQuestion.replace(/\s+/g, " ").trim()
        : "";
    const reason = q ? checkFollowUp(q, followUpCtx) : null;
    if (reason) stats.followUpRejected = reason;
    noRecord = {
      topic: clean(o.topic, TOPIC_MAX),
      followUpQuestion: q && !reason ? q : null,
    };
  }
  if (claims.length === 0 && conflicts.length === 0 && !noRecord) {
    noRecord = { topic: "", followUpQuestion: DEFAULT_FOLLOW_UP };
    stats.fallbackNoRecord = true;
  }

  // 인용 번호 = 카드가 처음 나온 순서.
  const citations: VerifiedAnswer["citations"] = [];
  const numberOf = (id: string) => {
    let c = citations.find((x) => x.cardId === id);
    if (!c) {
      c = { n: citations.length + 1, cardId: id };
      citations.push(c);
    }
    return c.n;
  };
  const withCites = (c: Omit<VerifiedClaim, "cites">): VerifiedClaim => ({
    ...c,
    cites: c.cardIds.map(numberOf),
  });
  const vClaims = claims.map(withCites);
  const vConflicts = conflicts.map((c) => ({
    topic: c.topic,
    sides: c.sides.map(withCites),
  }));

  const marks = (c: VerifiedClaim) => c.cites.map((n) => `[${n}]`).join("");
  const parts: string[] = vClaims.map((c) => `${c.text} ${marks(c)}`);
  for (const c of vConflicts) {
    parts.push(
      `${c.topic}${withJosa(c.topic, "은/는")} 서로 다른 기록이 있어요. ${c.sides
        .map((s) => `${s.text} ${marks(s)}`)
        .join(" / ")} 어느 쪽이 맞을까요?`,
    );
  }
  if (noRecord) {
    const lead =
      noRecord.topic && parts.length > 0
        ? `${noRecord.topic}${withJosa(noRecord.topic, "은/는")} ${NO_RECORD}`
        : NO_RECORD;
    parts.push(
      noRecord.followUpQuestion ? `${lead} ${noRecord.followUpQuestion}` : lead,
    );
  }

  return {
    text: parts.join(" "),
    claims: vClaims,
    conflicts: vConflicts,
    noRecord,
    citations,
    stats,
  };
}
