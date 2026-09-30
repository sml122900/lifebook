// 기억 에이전트 연구 트랙 — 카드 추출기 (R1-7). phase/기억에이전트_R1-R4_기획.md §2-3.
//
// 원본 1건(SourceUnit) → 카드 N장.
//   규칙 카드(LLM 0): 골격 사건, 프로필 필드, 인물 만난 해, 본문 없는 사건
//   LLM 카드(Sonnet, tool 스키마 강제): 에피소드·본문 있는 사건·시대 사건 회상·사진 캡션·인물 메모
// 코드가 맡는 것(모델에게 맡기지 않음):
//   - 인용 검증: 원문 필드의 연속 부분문자열이어야 저장(녹취는 [본인] 발화 안쪽만). 실패 카드는 버림
//   - 연도: 모델은 원문 시기 표현만 뽑고, 연도 변환은 resolvePeriod(결정적)
//   - 인물 연결: 모델은 호칭 문자열만, Person 연결은 코드(목록을 프롬프트에 넣지 않음 — S2 교훈)
//   - 타인 민감정보: 인물 메모·프로필 가족 항목에서 종교·정치·건강 단어가 든 카드는 버림
// 인용 위치(quoteStart/End)는 정규화된 필드 본문(SourceUnit.fields, 공백 1칸) 기준.

import type Anthropic from "@anthropic-ai/sdk";

import { modelId } from "../ai-model";
import { objectJosa } from "../josa";
import { labMessage } from "./llm";
import { resolvePeriod, type LifeStage, type PeriodContext } from "./period";
import { normText, type SourceUnit } from "./sources";

export const EXTRACT_MODEL = process.env.LAB_EXTRACT_MODEL ?? modelId("sonnet");
export const DETERMINISTIC = "deterministic";
const MAX_CARDS = 6;

export type CardKind =
  | "EVENT"
  | "FACT"
  | "PREFERENCE"
  | "FEELING"
  | "ROUTINE"
  | "RELATION";
const KINDS: readonly CardKind[] = [
  "EVENT",
  "FACT",
  "PREFERENCE",
  "FEELING",
  "ROUTINE",
  "RELATION",
];

export type CardDraft = {
  kind: CardKind;
  summary: string;
  quote: string | null;
  quoteField: string | null;
  quoteStart: number | null;
  quoteEnd: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  month: number | null;
  timePrecision: "MONTH" | "YEAR" | "RANGE" | "UNKNOWN";
  timeBasis: string;
  timeExpression: string | null;
  lifeStage: LifeStage | null;
  personIds: string[];
  personMentions: string[];
  placeNames: string[];
  keywords: string[];
  extractorModel: string;
};

export type PersonRef = { id: string; name: string; relation: string | null };

export type ExtractResult = {
  cards: CardDraft[];
  llm: boolean;
  droppedQuote: number;
  droppedSensitive: number;
};

export type Extractor = (
  unit: SourceUnit,
  ctx: PeriodContext,
  people: PersonRef[],
  meta: { userId: string; refId: string },
) => Promise<ExtractResult>;

// ── 인용 검증 ─────────────────────────────────────────────────────
const SPEAKER_TAG = /\[(본인|동반자|이 이야기의 인물)\]/g;

// 정규화된 필드 본문에서 인용 위치를 찾는다. 녹취(rawTranscript)는 인용이 [본인] 발화
// 안에 있어야 하고 화자 표시를 넘나들면 안 된다. 못 찾으면 null(카드를 버린다).
export function locateQuote(
  unit: SourceUnit,
  field: string,
  rawQuote: string,
): { quote: string; start: number; end: number } | null {
  const text = unit.fields[field];
  const quote = normText(rawQuote);
  if (!text || quote.length < 2) return null;
  const start = text.indexOf(quote);
  if (start < 0) return null;
  if (field === "rawTranscript") {
    if (/\[(본인|동반자|이 이야기의 인물)\]/.test(quote)) return null;
    let lastTag: string | null = null;
    for (const m of text.slice(0, start).matchAll(SPEAKER_TAG)) lastTag = m[1];
    if (lastTag !== "본인") return null;
  }
  return { quote, start, end: start + quote.length };
}

// ── 공통 ────────────────────────────────────────────────────────
// 타인 민감정보(종교·정치·건강) — 인물 메모·프로필 가족 항목 카드에만 적용.
// 화자 본인의 건강 이야기(에피소드·사건)는 화자가 한 말이라 카드로 둔다.
// ("집사"는 "집사람", "보수·진보"는 급여·일반어와 겹쳐 뺐다.)
const SENSITIVE_RE =
  /교회|성당|절에 다|사찰|불교|기독교|천주교|개신교|장로|권사|목사|신부님|스님|신앙|종교|정당|투표|좌파|우파|정치|병원|입원|수술|암 |암이|치매|우울|질환|장애|투병/;

function precisionOf(
  yearFrom: number | null,
  yearTo: number | null,
  month: number | null,
) {
  if (yearFrom === null) return "UNKNOWN" as const;
  if (yearFrom === yearTo && month !== null) return "MONTH" as const;
  return yearFrom === yearTo ? ("YEAR" as const) : ("RANGE" as const);
}

function unitTime(unit: SourceUnit) {
  return {
    yearFrom: unit.yearFrom,
    yearTo: unit.yearTo,
    month: unit.month,
    timePrecision: precisionOf(unit.yearFrom, unit.yearTo, unit.month),
    timeBasis: unit.yearFrom === null ? "NONE" : unit.timeBasis,
    timeExpression: null,
  };
}

const RELATION_ALIASES: Record<string, string[]> = {
  아내: ["아내", "집사람", "부인", "와이프", "안사람"],
  남편: ["남편", "바깥양반", "신랑"],
  어머니: ["어머니", "엄마", "어머님", "모친"],
  아버지: ["아버지", "아빠", "아버님", "부친"],
};

// 원문 호칭 → Person id. 이름 포함 또는 관계(동의어) 일치일 때만.
export function linkPeople(mentions: string[], people: PersonRef[]): string[] {
  const ids = new Set<string>();
  for (const raw of mentions) {
    const m = normText(raw);
    if (!m) continue;
    for (const p of people) {
      if (m.includes(p.name)) ids.add(p.id);
      else if (p.relation) {
        const rel = normText(p.relation);
        const aliases = Object.entries(RELATION_ALIASES).find(([k]) =>
          rel.includes(k),
        )?.[1] ?? [rel];
        if (aliases.some((a) => m === a || m.endsWith(a))) ids.add(p.id);
      }
    }
  }
  return [...ids];
}

function cleanList(xs: unknown, max: number): string[] {
  if (!Array.isArray(xs)) return [];
  return [
    ...new Set(
      xs
        .filter((x): x is string => typeof x === "string")
        .map(normText)
        .filter(Boolean),
    ),
  ].slice(0, max);
}

// ── 규칙 카드 ────────────────────────────────────────────────────
const PROFILE_FIELDS: readonly {
  key: string;
  label: string;
  kind: CardKind;
  aboutOthers?: boolean;
}[] = [
  { key: "hobbies", label: "취미", kind: "PREFERENCE" },
  { key: "interests", label: "관심사", kind: "PREFERENCE" },
  { key: "favMusic", label: "좋아하는 음악", kind: "PREFERENCE" },
  { key: "favMovies", label: "좋아하는 영화", kind: "PREFERENCE" },
  { key: "favGames", label: "좋아하는 게임", kind: "PREFERENCE" },
  {
    key: "userPreferences",
    label: "좋아하는 것(직접 입력)",
    kind: "PREFERENCE",
  },
  { key: "schools", label: "다닌 학교", kind: "FACT" },
  { key: "residences", label: "살았던 곳", kind: "FACT" },
  { key: "parentsInfo", label: "부모님", kind: "FACT", aboutOthers: true },
  { key: "siblings", label: "형제자매", kind: "FACT", aboutOthers: true },
  {
    key: "closeFriends",
    label: "가까운 친구",
    kind: "RELATION",
    aboutOthers: true,
  },
];

// 값이 이미 문장부호로 끝나면 마침표를 덧붙이지 않는다("…좋으셨다.." 방지).
function endDot(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function fullQuote(unit: SourceUnit, field: string) {
  const text = unit.fields[field];
  return {
    quote: text,
    quoteField: field,
    quoteStart: 0,
    quoteEnd: text.length,
  };
}

function baseCard(
  unit: SourceUnit,
): Omit<
  CardDraft,
  "kind" | "summary" | "quote" | "quoteField" | "quoteStart" | "quoteEnd"
> {
  return {
    ...unitTime(unit),
    lifeStage: unit.lifeStage,
    personIds: unit.personIds,
    personMentions: [],
    placeNames: unit.placeNames,
    keywords: [],
    extractorModel: DETERMINISTIC,
  };
}

export function deterministicCards(unit: SourceUnit): {
  cards: CardDraft[];
  droppedSensitive: number;
} {
  const cards: CardDraft[] = [];
  let droppedSensitive = 0;
  const y = unit.yearFrom;

  if (unit.sourceType === "SKELETON_EVENT") {
    const label = unit.fields.label;
    const summary =
      unit.extra.type === "BIRTH" && y !== null
        ? `화자는 ${y}년에 태어났다.`
        : endDot(`${y !== null ? `${y}년, ` : ""}화자의 인생 사건: ${label}`);
    cards.push({
      ...baseCard(unit),
      kind: "FACT",
      summary,
      ...fullQuote(unit, "label"),
    });
  } else if (unit.sourceType === "PROFILE") {
    for (const f of PROFILE_FIELDS) {
      const value = unit.fields[f.key];
      if (!value) continue;
      if (f.aboutOthers && SENSITIVE_RE.test(value)) {
        droppedSensitive += 1;
        continue;
      }
      cards.push({
        ...baseCard(unit),
        kind: f.kind,
        summary: endDot(`화자의 ${f.label}: ${value}`),
        keywords: value
          .split(/[,·]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8),
        ...fullQuote(unit, f.key),
      });
    }
  } else if (unit.sourceType === "PERSON_MEMO" && y !== null) {
    // 만난 해 — 메모가 있어도 따로 한 장(메모 카드는 LLM).
    const name = unit.title ?? "그 사람";
    const rel =
      typeof unit.extra.relation === "string" ? `(${unit.extra.relation})` : "";
    cards.push({
      ...baseCard(unit),
      kind: "RELATION",
      summary: `화자는 ${y}년에 ${name}${rel}${objectJosa(name)} 처음 만났다.`,
      quote: null,
      quoteField: null,
      quoteStart: null,
      quoteEnd: null,
    });
  } else if (unit.sourceType === "LIFE_EVENT_MEMORY" && !unit.fields.content) {
    cards.push({
      ...baseCard(unit),
      kind: "EVENT",
      summary: endDot(
        `${y !== null ? `${y}년, ` : ""}화자의 인생 사건: ${unit.fields.title}`,
      ),
      ...fullQuote(unit, "title"),
    });
  }
  return { cards, droppedSensitive };
}

export function needsLlm(unit: SourceUnit): boolean {
  switch (unit.sourceType) {
    case "EPISODE":
    case "ERA_MEMORY":
    case "PHOTO_MEMORY":
      return true;
    case "LIFE_EVENT_MEMORY":
      return !!unit.fields.content;
    case "PERSON_MEMO":
      return !!unit.fields.memo;
    default:
      return false;
  }
}

// ── LLM 카드 ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 한 사람("화자")의 인생 기록에서 "기억 카드"를 뽑는 추출기입니다. 반드시 emit_cards 도구로만 답합니다.

원칙
1. 화자가 실제로 말하거나 적은 사실만 카드로 만든다. 추측·해석·창작 금지. 원문에 없는 내용을 보태지 않는다.
2. summary: 3인칭, 주어는 항상 "화자", "-다"로 끝나는 평서문 1~2문장(20~150자). 존댓말·감탄 금지.
3. quote: 근거가 되는 원문의 연속 구간을 한 글자도 고치지 말고 그대로 복사한다(8~120자). 맞춤법·띄어쓰기도 원문 그대로. quoteField 에는 그 구간이 있는 필드 이름을 적는다.
   - rawTranscript 필드에서는 반드시 "[본인]" 발화 안에서만 인용한다. "[동반자]" 질문이나 "[이 이야기의 인물]" 줄은 인용하지 않는다.
4. 카드 나누기: 서로 다른 사실(사건·감정·취향·습관·인물 관계)은 카드를 나누고, 같은 사실을 두 번 쓰지 않는다. 원본이 짧으면 1장. 최대 6장.
5. timeExpression: 그 카드의 시기를 가리키는 원문 표현을 그대로 적는다(예: "82년 봄", "군대 있을 때", "스무 살 무렵"). 연도를 계산하거나 바꾸지 않는다. 원문에 시기 표현이 없으면 null.
6. people: 카드에 나오는 다른 사람을 원문 호칭 그대로 적는다(예: "어머니", "봉구", "집사람"). 화자 본인은 넣지 않는다.
7. places: 원문에 나온 장소 이름 그대로. keywords: 조사를 뗀 핵심 명사 3~8개.
8. 다른 사람의 독립된 사건(예: 자녀의 입학)은 화자의 사건으로 쓰지 말고, 화자와의 관계로만 쓴다.
9. 다른 사람의 건강·종교·정치에 관한 내용은 카드로 만들지 않는다(그 부분만 빼고 나머지는 카드로 만든다). 화자 본인이 말한 자기 건강 이야기는 그대로 카드로 만든다.
10. 동반자의 질문·인사·맞장구는 카드가 아니다. 카드로 만들 사실이 없으면 cards 를 빈 배열로 둔다.

kind
- EVENT 일어난 일 · FACT 사실·신상 · PREFERENCE 좋아함/싫어함 · FEELING 감정·소회 · ROUTINE 반복 습관 · RELATION 사람과의 관계

예시
[원본 유형] 인생 사건
[content] 회사 회식 때 회가 나왔는데 비려서 하나도 못 먹었다. 대신 김치찌개만 두 그릇.
→ cards: [{"kind":"PREFERENCE","summary":"화자는 비린 회를 먹지 못해 회사 회식 때 회를 한 점도 먹지 않았다.","quote":"회가 나왔는데 비려서 하나도 못 먹었다","quoteField":"content","timeExpression":"회사 회식 때","people":[],"places":[],"keywords":["회","회식","비린 음식"]}]`;

const SOURCE_LABEL: Record<string, string> = {
  EPISODE: "에피소드(대화 요약 content + 대화 녹취 rawTranscript)",
  LIFE_EVENT_MEMORY: "인생 사건",
  ERA_MEMORY: "시대 사건에 대한 화자의 회상",
  PHOTO_MEMORY: "사진 설명",
  PERSON_MEMO: "화자가 적은 인물 메모",
};

const EMIT_CARDS_TOOL: Anthropic.Tool = {
  name: "emit_cards",
  description: "원본에서 뽑은 기억 카드 목록을 제출한다.",
  input_schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        maxItems: MAX_CARDS,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...KINDS] },
            summary: { type: "string" },
            quote: { type: "string" },
            quoteField: { type: "string" },
            timeExpression: { type: ["string", "null"] },
            people: { type: "array", items: { type: "string" } },
            places: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
          },
          required: [
            "kind",
            "summary",
            "quote",
            "quoteField",
            "timeExpression",
            "people",
            "places",
            "keywords",
          ],
        },
      },
    },
    required: ["cards"],
  },
};

function buildUserMessage(unit: SourceUnit): string {
  const lines = [
    `[원본 유형] ${SOURCE_LABEL[unit.sourceType] ?? unit.sourceType}`,
  ];
  if (unit.title) {
    lines.push(
      `[제목] ${unit.title}${unit.sourceType === "ERA_MEMORY" ? " (시대 사건 — 맥락일 뿐, 카드는 화자의 회상만)" : ""}`,
    );
  }
  if (unit.sourceType === "PERSON_MEMO") {
    const rel =
      typeof unit.extra.relation === "string"
        ? ` (관계: ${unit.extra.relation})`
        : "";
    lines.push(`[인물] ${unit.title ?? ""}${rel}`);
  }
  for (const [field, text] of Object.entries(unit.fields))
    lines.push(`[${field}]\n${text}`);
  return lines.join("\n");
}

type RawCard = {
  kind?: unknown;
  summary?: unknown;
  quote?: unknown;
  quoteField?: unknown;
  timeExpression?: unknown;
  people?: unknown;
  places?: unknown;
  keywords?: unknown;
};

export const llmExtractor: Extractor = async (
  unit,
  ctx,
  people,
  { userId, refId },
) => {
  const res = await labMessage(
    {
      model: EXTRACT_MODEL,
      max_tokens: 1200,
      temperature: 0,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [EMIT_CARDS_TOOL],
      tool_choice: { type: "tool", name: "emit_cards" },
      messages: [{ role: "user", content: buildUserMessage(unit) }],
    },
    { purpose: "EXTRACT", userId, refId },
  );
  const block = res.content.find((b) => b.type === "tool_use");
  const raw =
    (block && block.type === "tool_use"
      ? (block.input as { cards?: unknown }).cards
      : []) ?? [];
  const rawCards: RawCard[] = Array.isArray(raw)
    ? (raw as RawCard[]).slice(0, MAX_CARDS)
    : [];

  let droppedQuote = 0;
  let droppedSensitive = 0;
  const cards: CardDraft[] = [];
  for (const c of rawCards) {
    const summary = typeof c.summary === "string" ? normText(c.summary) : "";
    const kind = KINDS.includes(c.kind as CardKind)
      ? (c.kind as CardKind)
      : "FACT";
    const field = typeof c.quoteField === "string" ? c.quoteField : "";
    const loc =
      typeof c.quote === "string" ? locateQuote(unit, field, c.quote) : null;
    if (!summary || !loc) {
      droppedQuote += 1;
      continue;
    }
    if (
      unit.sourceType === "PERSON_MEMO" &&
      (SENSITIVE_RE.test(summary) || SENSITIVE_RE.test(loc.quote))
    ) {
      droppedSensitive += 1;
      continue;
    }
    const mentions = cleanList(c.people, 10);
    const timeExpression =
      typeof c.timeExpression === "string" && c.timeExpression.trim()
        ? normText(c.timeExpression)
        : null;
    // 시대 사건 회상은 담은 사건(MonthEvent)의 연도가 정답 — 원문 표현("올림픽 개막식")을
    // 시대 사건 목록에서 다시 찾으면 다른 해(2026 올림픽)로 오인한다(R1-7 실측).
    const resolved =
      timeExpression && unit.sourceType !== "ERA_MEMORY"
        ? resolvePeriod(timeExpression, ctx)
        : null;
    // 인물 메모는 시점 없는 서술이라 원본 연도(만난 해)를 물려받지 않는다 — 만난 해는
    // 규칙 카드가 따로 한 장.
    const fallback =
      unit.sourceType === "PERSON_MEMO"
        ? {
            yearFrom: null,
            yearTo: null,
            month: null,
            timePrecision: "UNKNOWN" as const,
            timeBasis: "NONE",
          }
        : unitTime(unit);
    const time = resolved?.ok
      ? {
          yearFrom: resolved.yearFrom,
          yearTo: resolved.yearTo,
          month: null,
          timePrecision: resolved.precision,
          timeBasis: resolved.basis,
        }
      : fallback;
    const linked = linkPeople(mentions, people);
    cards.push({
      kind,
      summary,
      quote: loc.quote,
      quoteField: field,
      quoteStart: loc.start,
      quoteEnd: loc.end,
      ...time,
      timeExpression,
      lifeStage:
        resolved?.ok && resolved.lifeStage
          ? resolved.lifeStage
          : unit.lifeStage,
      personIds:
        unit.sourceType === "PERSON_MEMO"
          ? [...new Set([...unit.personIds, ...linked])]
          : linked,
      personMentions: mentions,
      placeNames: cleanList(c.places, 10),
      keywords: cleanList(c.keywords, 8),
      extractorModel: EXTRACT_MODEL,
    });
  }
  return { cards, llm: true, droppedQuote, droppedSensitive };
};

// 원본 1건 → 카드. 규칙 카드 + (필요하면) LLM 카드. extractor 는 테스트에서 가짜로 바꿔 끼운다.
export async function extractUnit(
  unit: SourceUnit,
  ctx: PeriodContext,
  people: PersonRef[],
  meta: { userId: string; refId: string },
  extractor: Extractor = llmExtractor,
): Promise<ExtractResult> {
  const det = deterministicCards(unit);
  if (!needsLlm(unit)) {
    return {
      cards: det.cards,
      llm: false,
      droppedQuote: 0,
      droppedSensitive: det.droppedSensitive,
    };
  }
  const llm = await extractor(unit, ctx, people, meta);
  return {
    cards: [...llm.cards, ...det.cards],
    llm: true,
    droppedQuote: llm.droppedQuote,
    droppedSensitive: llm.droppedSensitive + det.droppedSensitive,
  };
}
