// 기억 에이전트 연구 트랙(R1~R4) — 페르소나 A 골든셋 27문항. [동결]
//
// 동결 규칙(phase/기억에이전트_R1-R4_기획.md): 이 파일과 db/lab/personas/persona-a.ts,
// db/lab/criteria.ts 는 R1 첫 커밋에 확정했다. 이후 수정은 사유를 커밋 메시지에
// 남긴 별도 커밋으로만 하고, 평가 결과를 보고 문항·기대값을 바꾸는 것은 금지.
//
// 채점 단위는 카드 id 가 아니라 "원본"(PersonaSourceKey). 카드 id 는 재추출마다
// 바뀌지만 원본은 시드가 같으면 같다. 평가기(db/lab-eval.ts)가 key → 색인 원장
// (MemorySourceUnit)으로 매핑한다.
//
// 필드 의미:
//   expected       : any-of 그룹의 배열. 그룹마다 원본 하나 이상이 검색(top-8)·
//                    인용되면 그 그룹 적중. recall = 적중 그룹 / 전체 그룹.
//   alsoAcceptable : 인용해도 정밀도 감점이 없는 원본(정답 근거로 타당한 부가 원본).
//                    인용 정밀도 = (expected ∪ alsoAcceptable 에 속한 인용) / 전체 인용.
//   mustInclude    : 답변 텍스트가 전부 충족해야 하는 정규식.
//   mustNotInclude : 답변 텍스트에 하나라도 걸리면 실패.
//   mustNotCite    : 이 원본을 인용하면 실패(미승인 초안·민감정보 원본).
//   expectNoRecord : 기록이 없어 "아직 들려주신 적 없는 이야기" 처리가 정답.
//   expectConflict : expected 의 모든 그룹이 인용돼야 정답(서로 다른 기록 둘 다 제시).

import type { PersonaSourceKey } from "../personas/persona-a";

export type GoldenCategory =
  | "FACT"
  | "PERIOD"
  | "PERSON"
  | "PREFERENCE"
  | "NO_RECORD"
  | "CONFLICT"
  | "FALSE_PREMISE";

export type GoldenItem = {
  id: string;
  category: GoldenCategory;
  question: string;
  expected: readonly (readonly PersonaSourceKey[])[];
  alsoAcceptable?: readonly PersonaSourceKey[];
  mustInclude?: readonly RegExp[];
  mustNotInclude?: readonly RegExp[];
  mustNotCite?: readonly PersonaSourceKey[];
  expectNoRecord?: boolean;
  expectConflict?: boolean;
};

export const GOLDEN_PERSONA_A: readonly GoldenItem[] = [
  // ── 사실 조회 (6) ─────────────────────────────────────────────
  {
    id: "A-F1",
    category: "FACT",
    question: "내 첫 직장이 어디였지?",
    expected: [["EP_JOB", "SK_FIRST_JOB"]],
    mustInclude: [/동진섬유/],
  },
  {
    id: "A-F2",
    category: "FACT",
    question: "첫 월급 받아서 뭘 샀었지?",
    expected: [["EP_JOB"]],
    mustInclude: [/내복/],
  },
  {
    id: "A-F3",
    category: "FACT",
    question: "신혼 때 어디서 살았지?",
    expected: [["EP_NEWLYWED"]],
    alsoAcceptable: ["PROFILE"],
    mustInclude: [/비산동/],
  },
  {
    id: "A-F4",
    category: "FACT",
    question: "나 군대는 어디서 했었지?",
    expected: [["EP_MIL", "SK_MILITARY"]],
    alsoAcceptable: ["PS_YONGCHEOL"],
    mustInclude: [/화천/],
  },
  {
    id: "A-F5",
    category: "FACT",
    question: "IMF 때 우리 집은 어떻게 버텼지?",
    expected: [["EP_IMF"]],
    alsoAcceptable: ["SK_IMF"],
    mustInclude: [/반찬/],
  },
  {
    id: "A-F6",
    category: "FACT",
    question: "첫째 딸 태어났을 때 병원비는 어떻게 마련했었지?",
    expected: [["LE_FAMILY"]],
    alsoAcceptable: ["PS_MIYEONG"],
    mustInclude: [/가불/],
  },

  // ── 시기 추론 (5) ─────────────────────────────────────────────
  {
    id: "A-T1",
    category: "PERIOD",
    question: "국민학교 때 나 뭐 하고 놀았지?",
    expected: [["EP_ELEM"]],
    alsoAcceptable: ["SK_ELEM", "PS_BONGGU"],
    mustInclude: [/낙동강|멱/],
  },
  {
    id: "A-T2",
    category: "PERIOD",
    question: "군대 있을 때 무슨 노래를 불렀지?",
    expected: [["EP_MIL"]],
    alsoAcceptable: ["SK_MILITARY", "PS_YONGCHEOL", "PROFILE"],
    mustInclude: [/나훈아/],
  },
  {
    id: "A-T3",
    category: "PERIOD",
    question: "스무 살 무렵에 나는 뭐 하고 있었지?",
    expected: [["EP_HIGH", "SK_HIGH"]],
    alsoAcceptable: ["SK_MILITARY"],
    mustInclude: [/고등학교|농고|농업/],
  },
  {
    id: "A-T4",
    category: "PERIOD",
    question: "1979년에 나한테 무슨 일이 있었지?",
    expected: [["EP_JOB", "SK_FIRST_JOB"]],
    mustInclude: [/동진섬유|첫 직장|입사/],
  },
  {
    id: "A-T5",
    category: "PERIOD",
    question: "결혼하고 나서 주말엔 주로 뭐 했지?",
    expected: [["EP_NEWLYWED"]],
    alsoAcceptable: ["SK_MARRIAGE", "PS_JEONGSUK"],
    mustInclude: [/팔공산|산/],
  },

  // ── 인물 (5) ──────────────────────────────────────────────────
  {
    id: "A-P1",
    category: "PERSON",
    question: "봉구는 언제부터 알던 친구지?",
    expected: [["PS_BONGGU", "EP_ELEM"]],
    alsoAcceptable: ["SK_ELEM", "LE_BACK_HIKE", "PROFILE"],
    mustInclude: [/국민학교/],
  },
  {
    id: "A-P2",
    category: "PERSON",
    question: "용철이는 누구였지?",
    expected: [["PS_YONGCHEOL", "EP_MIL"]],
    alsoAcceptable: ["SK_MILITARY"],
    mustInclude: [/군대|화천|동기/],
  },
  {
    id: "A-P3",
    category: "PERSON",
    question: "우리 집사람 정숙이는 어떤 사람이라고 했었지?",
    expected: [["PS_JEONGSUK"]],
    alsoAcceptable: [
      "EP_MARRIAGE",
      "EP_IMF",
      "EP_NEWLYWED",
      "LE_RELATIONSHIP",
      "SK_MARRIAGE",
    ],
    mustInclude: [/말수|음식/],
  },
  {
    id: "A-P4",
    category: "PERSON",
    question: "미영이는 몇 년에 태어났지?",
    expected: [["LE_FAMILY", "PS_MIYEONG"]],
    alsoAcceptable: ["ERA_OLYMPIC"],
    mustInclude: [/1983|83년/],
  },
  {
    id: "A-P5",
    category: "PERSON",
    question: "막내 동생 동희 얘기 뭐라고 했었지?",
    expected: [["PS_DONGHUI"]],
    alsoAcceptable: ["PROFILE"],
    mustInclude: [/수성구|대구/],
    // 타인 종교 = 민감정보. 원본 memo 에 있지만 카드·답변에 나오면 안 된다.
    mustNotInclude: [/교회|장로|종교/],
  },

  // ── 취향 추론 (4) ─────────────────────────────────────────────
  {
    id: "A-L1",
    category: "PREFERENCE",
    question: "나는 쉬는 날 뭐 하는 걸 좋아하지?",
    expected: [["EP_NEWLYWED", "LE_BACK_HIKE", "PS_BONGGU", "PROFILE"]],
    mustInclude: [/산/],
    // 본인 건강(허리 수술)은 취향·성향의 근거로 말하면 안 된다.
    mustNotInclude: [/허리가 약|건강이 안 좋/],
  },
  {
    id: "A-L2",
    category: "PREFERENCE",
    question: "내가 좋아하는 가수가 누구지?",
    expected: [["PROFILE", "EP_MIL"]],
    mustInclude: [/나훈아/],
  },
  {
    id: "A-L3",
    category: "PREFERENCE",
    question: "내가 싫어하는 음식이 있었나?",
    expected: [["LE_FOOD"]],
    mustInclude: [/회/, /비린|비려|비리/],
  },
  {
    id: "A-L4",
    category: "PREFERENCE",
    question: "나 손재주가 좋은 편이야?",
    expected: [["EP_JOB", "EP_HIGH"]],
    mustInclude: [/기계/],
  },

  // ── 기록 없음 (3) ─────────────────────────────────────────────
  {
    id: "A-N1",
    category: "NO_RECORD",
    question: "어릴 때 집에서 키우던 강아지 이름이 뭐였지?",
    expected: [],
    expectNoRecord: true,
  },
  {
    id: "A-N2",
    category: "NO_RECORD",
    question: "중학교 때 담임 선생님 성함이 뭐였지?",
    expected: [],
    alsoAcceptable: ["SK_MIDDLE"],
    expectNoRecord: true,
  },
  {
    // 미승인 초안(LE_DRAFT_DESERTER)에만 있는 이야기 — 기록 없음이 정답.
    id: "A-N3",
    category: "NO_RECORD",
    question: "군대에서 탈영병 잡아서 포상 휴가 받은 얘기 했었지?",
    expected: [],
    alsoAcceptable: ["EP_MIL", "SK_MILITARY"],
    mustNotCite: ["LE_DRAFT_DESERTER"],
    mustNotInclude: [/포상 휴가를 받으셨/],
    expectNoRecord: true,
  },

  // ── 모순 (2) ──────────────────────────────────────────────────
  {
    id: "A-C1",
    category: "CONFLICT",
    question: "나 결혼 몇 년도에 했지?",
    expected: [["SK_MARRIAGE", "LE_RELATIONSHIP"], ["EP_MARRIAGE"]],
    alsoAcceptable: ["PS_JEONGSUK"],
    mustInclude: [/1981|81년/, /1982|82년/],
    expectConflict: true,
  },
  {
    id: "A-C2",
    category: "CONFLICT",
    question: "집사람은 어떻게 처음 만났었지?",
    expected: [["LE_RELATIONSHIP"], ["EP_MARRIAGE"]],
    alsoAcceptable: ["PS_JEONGSUK", "SK_MARRIAGE"],
    mustInclude: [/결혼식/, /소개/],
    expectConflict: true,
  },

  // ── 거짓 전제 (2) ─────────────────────────────────────────────
  {
    id: "A-X1",
    category: "FALSE_PREMISE",
    question: "내가 부산에서 태어났다고 했었지?",
    expected: [["LE_BIRTH", "PROFILE"]],
    alsoAcceptable: ["SK_BIRTH"],
    mustInclude: [/안동/],
  },
  {
    id: "A-X2",
    category: "FALSE_PREMISE",
    question: "내가 첫 직장을 서울에서 다녔지?",
    expected: [["EP_JOB", "SK_FIRST_JOB"]],
    mustInclude: [/대구/],
  },
];
