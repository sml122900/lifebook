// Phase 10 Phase 2 — 통녹음 전사를 시간순 사건 조각으로 분할.
//
// Claude 가 시기·주제 전환점을 찾아 각 조각에 제목·연도·카테고리를 추론.
// 별도 토큰 차감 없음 — STT 분당 요금에 포함(후처리).
//
// 환경변수 FREE_RECORDING_SPLIT_MODEL 로 모델 오버라이드 가능.

import { chat } from "./ai";

const SPLIT_MODEL =
  process.env.FREE_RECORDING_SPLIT_MODEL ?? "claude-sonnet-4-6";

// S4 — 긴 전사 청크 처리.
const SINGLE_LIMIT = 12000; // 이하면 한 번에(짧은 전사 = 기존 동작 유지)
const CHUNK_CHAR_LIMIT = 8000; // 긴 전사 청크당 입력 글자(출력이 maxTokens 안 넘게)
const OVERLAP_UNITS = 2; // 청크 간 겹치는 끝 턴 수(경계 사건 누락 방지)
const SPLIT_MAX_TOKENS = 4096; // 사건 많으면 출력 큼 → 상향(기존 2048서 JSON 깨짐)

// 유효한 LifeCategory 값 (schema.prisma 와 동기화 유지).
const VALID_CATEGORIES = new Set([
  "BIRTH", "KINDERGARTEN", "ELEMENTARY", "MIDDLE", "HIGH",
  "UNIVERSITY", "MILITARY", "WORK", "RELATIONSHIP", "FAMILY",
]);

export type SplitSegment = {
  title: string;
  content: string;
  estimatedYear: number | null;
  estimatedMonth: number | null;
  category: string | null; // LifeCategory 또는 null
  precision: "EXACT" | "APPROXIMATE";
};

export type SplitResult = {
  segments: SplitSegment[];
  nextTopics: string[];
  // S6-a — 취향·선호(색·꽃·음식·계절·성격 등). 사건이 아니라 별도 수집.
  // 포스터 맞춤 디자인(색·오브젝트)용 데이터. 저장 위치·UI 는 후속(P3~P5).
  preferences: string[];
};

const SYSTEM_PROMPT = `당신은 어르신의 구술 회상을 시간순 이야기 조각으로 나누는 역할을 합니다.
반드시 유효한 JSON 만 출력하세요. 설명이나 다른 텍스트는 절대 출력하지 마세요.

[프라이버시 — 절대 규칙]
화자가 "쓰지 마라", "빼줘", "기록하지 마", "이건 빼", "다한테 그거는 쓰지 마라" 처럼
기록을 명시적으로 거부한 내용은 사건(segment)으로 만들지 마세요. 그 내용은 통째로
버립니다(요약·암시도 금지). 특히 거절·험담의 대상이 된 타인의 신상(가문·직업·집안
형편·재산 등)은 절대 사건에 넣지 마세요. 어르신 *본인*의 이야기만 사건화합니다.`;

// S2 — 이미 연혁에 있는 사건. 중복 재생성을 막으려 추출 프롬프트에 주입한다
// (fetchCoverageContext 패턴). 연도가 1~2년 달라도 같은 사건이면 스킵.
export type ExistingEvent = { year: number | null; title: string };

export async function splitRecordingTranscript(
  transcript: string,
  topicTitle: string,
  birthYear: number | null,
  existingEvents: ExistingEvent[] = [],
): Promise<SplitResult> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      segments: [{
        title: topicTitle,
        content: "",
        estimatedYear: null,
        estimatedMonth: null,
        category: null,
        precision: "APPROXIMATE",
      }],
      nextTopics: [],
      preferences: [],
    };
  }

  // S4 — 짧은 전사는 한 번에(기존 동작 유지), 긴 전사는 청크 분할.
  let result: SplitResult;
  if (trimmed.length <= SINGLE_LIMIT) {
    result = await splitOneChunk(trimmed, topicTitle, birthYear, existingEvents);
  } else {
    // 턴(줄) 경계로 청크 분할 + 끝 OVERLAP_UNITS 턴을 다음 청크에 겹쳐 경계
    // 사건 누락 방지. 각 청크 split → 병합(겹침 중복은 mergeSplitResults 가 제거).
    const chunks = chunkByUnits(trimmed, CHUNK_CHAR_LIMIT, OVERLAP_UNITS);
    const parts: SplitResult[] = [];
    for (const c of chunks) {
      parts.push(await splitOneChunk(c, topicTitle, birthYear, existingEvents));
    }
    result = mergeSplitResults(parts);
  }

  // S2 — 2차 코드 dedup(보수적). 프롬프트 주입(1차)이 놓친 명백한 중복만 제거.
  // 새 사건 누락 위험 0 우선 — 확실할 때만 스킵, 애매하면 통과(draft 검토에서 거름).
  if (existingEvents.length > 0) {
    result.segments = result.segments.filter(
      (s) => !isDuplicateOfExisting(s, existingEvents),
    );
  }
  return result;
}

// 전사 한 덩어리(청크)를 split 하는 LLM 호출. splitRecordingTranscript 가
// 짧으면 1회, 길면 청크마다 호출한다.
async function splitOneChunk(
  chunkText: string,
  topicTitle: string,
  birthYear: number | null,
  existingEvents: ExistingEvent[],
): Promise<SplitResult> {
  const birthLine = birthYear != null ? `출생연도: ${birthYear}` : "출생연도: 모름";
  const catList = [...VALID_CATEGORIES].join("/");

  // S2 — 이미 연혁에 있는 사건 목록. 같은 사건 재생성 방지용.
  const existingBlock =
    existingEvents.length > 0
      ? `\n[이미 연혁에 기록된 사건] — 아래와 같은 사건은 다시 만들지 마세요:\n` +
        existingEvents
          .map((e) => `- ${e.year != null ? `${e.year}년: ` : ""}${e.title}`)
          .join("\n") +
        `\n`
      : "";

  const userMsg = `물꼬(주제): ${topicTitle}
${birthLine}
${existingBlock}
---전사---
${chunkText.slice(0, SINGLE_LIMIT)}
---끝---

아래 JSON 형식으로 응답하세요:
{
  "segments": [
    {
      "title": "짧은 제목 (30자 이하)",
      "content": "이 부분의 이야기를 자연스럽고 읽기 쉽게 정리한 글",
      "estimatedYear": 1987,
      "estimatedMonth": null,
      "category": "WORK",
      "precision": "APPROXIMATE"
    }
  ],
  "nextTopics": ["후속 주제나 질문", "또 다른 질문"],
  "preferences": ["은은한 색(흑백·하늘색) 선호", "선인장 같은 오래 가는 식물 좋아함"]
}

분할 규칙:
0. ★프라이버시(최우선): 화자가 "쓰지 마라/빼줘/기록하지 마"라고 한 내용, 특히 거절·험담 대상이 된 타인의 신상은 segments 에서 제외(버림).
0-1. ★취향 제외: 좋아하는 색·꽃·음식·계절·성격 같은 취향/선호는 사건이 아닙니다(언제 일어난 일이 아니라 성향). segments 에 넣지 말고 preferences 배열에 한 줄씩 담으세요. 취향이 없으면 preferences 는 [].
0-2. ★중복 금지: 위 [이미 연혁에 기록된 사건] 과 같은 사건(연도가 1~2년 달라도 동일 사건이면)은 segments 에 넣지 마세요. 정말 새로운 사건만 출력하세요. 새 사건이 없으면 segments 는 빈 배열 [] 로 두세요.
0-3. ★주어 가드: 사건의 주인공(행위 주체)이 어르신 본인일 때만 사건으로 만드세요.
   - 자식·타인이 주체인 독립 사건은 사건이 아닙니다(빼세요). 예: "아들이 콜롬비아대에 진학했다", "딸이 취업·결혼했다", "아들이 기숙사 고등학교에 들어갔다".
   - 단, 어르신이 주체로 관여한 일은 본인 사건으로 OK. 예: "내가 아이들 데리고 미국에 갔다"(어르신 이주), "아이들 교육 위해 내가 대학원에 등록했다"(어르신 행위), "내가 아이를 낳았다"(출산).
   - 자식의 독립 소식은 사건이 아니라 인물 정보로만 다뤄집니다(여기 사건엔 넣지 마세요).
1. 주제나 시기가 크게 바뀌는 지점에서만 나누세요. 최대 10개.
2. 이야기가 하나라면 segments 는 1개만. 억지로 나누지 마세요.
3. estimatedYear: 연도 추론. "20대 때"는 출생연도+20, "군대"는 출생연도+21. 알 수 없으면 null.
4. estimatedMonth: 월이 명확히 언급됐으면 1~12, 모르면 null.
5. category 선택지(맞는 것 없으면 null): ${catList}
6. precision: 정확한 연도가 명시됐으면 "EXACT", 추정이면 "APPROXIMATE".
7. nextTopics: 이야기에서 더 들을 만한 구체적 후속 질문 2~3개. 언급된 인물·장소·에피소드 활용.`;

  const res = await chat(
    [{ role: "user", content: userMsg }],
    {
      system: SYSTEM_PROMPT,
      model: SPLIT_MODEL,
      maxTokens: SPLIT_MAX_TOKENS,
      temperature: 0.3,
    },
  );

  return parseResponse(res.text, topicTitle, chunkText);
}

// S4 — 텍스트를 줄(턴) 경계로 청크 분할. 각 청크는 limit 글자 이하, 인접 청크는
// 끝 overlap 턴을 공유(경계에 걸친 사건이 양쪽에서 보이게 → 누락 방지).
function chunkByUnits(text: string, limit: number, overlap: number): string[] {
  const units = text.split("\n").filter((u) => u.trim().length > 0);
  const chunks: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  for (const u of units) {
    if (curLen + u.length + 1 > limit && cur.length > 0) {
      chunks.push(cur.join("\n"));
      cur = cur.slice(-overlap); // 끝 overlap 턴을 다음 청크 머리로
      curLen = cur.reduce((s, x) => s + x.length + 1, 0);
    }
    cur.push(u);
    curLen += u.length + 1;
  }
  if (cur.length > 0) chunks.push(cur.join("\n"));
  return chunks;
}

// S4 — 청크별 결과 병합. 겹침(overlap) 때문에 경계 사건이 두 청크에 다 나올 수
// 있어 보수적으로 중복 제거(연도 ±1 + 의미 토큰 겹침 = 같은 사건). nextTopics 는
// 마지막 청크 것(가장 뒷부분 = 다음 대화 물꼬로 자연스러움).
function mergeSplitResults(parts: SplitResult[]): SplitResult {
  const merged: SplitSegment[] = [];
  for (const p of parts) {
    for (const s of p.segments) {
      if (!merged.some((m) => sameBoundarySegment(m, s))) merged.push(s);
    }
  }
  const last = parts.length > 0 ? parts[parts.length - 1] : null;
  // S6-a — 취향은 청크 전체에서 모아 중복 제거(같은 취향이 여러 청크에 날 수 있음).
  const prefSet = new Set<string>();
  for (const p of parts) for (const pref of p.preferences) prefSet.add(pref);
  return {
    segments: merged.slice(0, 10),
    nextTopics: (last?.nextTopics ?? []).slice(0, 3),
    preferences: [...prefSet].slice(0, 10),
  };
}

// 두 세그먼트가 같은 경계 사건인지(overlap 중복). 연도 둘 다 있으면 ±1 밖은
// 다른 사건. 의미 토큰이 없으면 제목 정확 일치로 판정.
function sameBoundarySegment(a: SplitSegment, b: SplitSegment): boolean {
  if (
    a.estimatedYear != null &&
    b.estimatedYear != null &&
    Math.abs(a.estimatedYear - b.estimatedYear) > 1
  ) {
    return false;
  }
  const at = new Set(significantTokens(a.title));
  const bt = significantTokens(b.title);
  if (at.size === 0 || bt.length === 0) return a.title.trim() === b.title.trim();
  return bt.some((t) => at.has(t));
}

// 흔한 한국어 조사 — 토큰 끝에서 떼어내 "결혼식"=="결혼식을" 매칭되게.
const JOSA_RE =
  /(으로서|으로|로서|에서|에게|에다가|에다|이랑|까지|부터|마다|조차|이나|나마|을|를|이|가|은|는|에|의|도|로|와|과|랑|만)$/;

// 의미 있는 토큰(2글자 이하 조사·일반어 제외). "결혼"(2)·"미국"(2) 같은 짧은
// 공통어로 오스킵되는 걸 막으려 조사 제거 후 길이 3 이상만 본다.
function significantTokens(s: string): string[] {
  return s
    .split(/[^가-힣A-Za-z0-9]+/)
    .map((t) => t.replace(JOSA_RE, ""))
    .filter((t) => t.length >= 3);
}

// 보수적 중복 판정: 연도 ±1 AND 의미 토큰(≥3글자)이 하나라도 정확히 일치.
// "경북여중"·"이화여고" 처럼 고유 기관명이 겹칠 때만 걸리고, "결혼식 vs
// 결혼여행"(공통 토큰 없음)·"미국 파견 vs 미국 이민"(미국=2글자 제외)은 통과.
function isDuplicateOfExisting(
  seg: SplitSegment,
  existing: ExistingEvent[],
): boolean {
  if (seg.estimatedYear == null) return false; // 연도 없으면 안전하게 통과
  const segTokens = new Set(significantTokens(seg.title));
  if (segTokens.size === 0) return false;
  for (const e of existing) {
    if (e.year == null) continue;
    if (Math.abs(e.year - seg.estimatedYear) > 1) continue;
    if (significantTokens(e.title).some((t) => segTokens.has(t))) return true;
  }
  return false;
}

function parseResponse(
  raw: string,
  topicTitle: string,
  transcript: string,
): SplitResult {
  const fallback: SplitResult = {
    segments: [{
      title: topicTitle,
      content: transcript,
      estimatedYear: null,
      estimatedMonth: null,
      category: null,
      precision: "APPROXIMATE",
    }],
    nextTopics: [],
    preferences: [],
  };

  try {
    // 코드블록 래핑 제거
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as {
      segments?: unknown[];
      nextTopics?: unknown[];
      preferences?: unknown[];
    };

    const segments: SplitSegment[] = [];
    for (const s of (Array.isArray(parsed.segments) ? parsed.segments : [])) {
      if (!s || typeof s !== "object") continue;
      const seg = s as Record<string, unknown>;
      const cat = typeof seg.category === "string" && VALID_CATEGORIES.has(seg.category)
        ? seg.category
        : null;
      segments.push({
        title: typeof seg.title === "string" ? seg.title.slice(0, 50) : topicTitle,
        content: typeof seg.content === "string" ? seg.content : "",
        estimatedYear: typeof seg.estimatedYear === "number" ? Math.floor(seg.estimatedYear) : null,
        estimatedMonth: typeof seg.estimatedMonth === "number"
          ? Math.min(12, Math.max(1, Math.floor(seg.estimatedMonth)))
          : null,
        category: cat,
        precision: seg.precision === "EXACT" ? "EXACT" : "APPROXIMATE",
      });
    }

    const nextTopics: string[] = [];
    for (const t of (Array.isArray(parsed.nextTopics) ? parsed.nextTopics : [])) {
      if (typeof t === "string" && t.trim()) nextTopics.push(t.trim());
    }

    // S6-a — 취향(preferences) 파싱. 문자열만, 한 줄당 cap.
    const preferences: string[] = [];
    for (const p of (Array.isArray(parsed.preferences) ? parsed.preferences : [])) {
      if (typeof p === "string" && p.trim()) preferences.push(p.trim().slice(0, 100));
    }

    // S2 — JSON 파싱이 성공했고 segments 키가 배열이면 빈 배열도 정상 결과
    // (모든 사건이 기존 연혁과 중복 → 새 사건 0). 이 경우 원문 덤프 fallback
    // 으로 빠지지 않는다. fallback 은 오직 JSON 파싱 자체가 깨졌을 때만(catch).
    if (!Array.isArray(parsed.segments)) return fallback;
    return {
      segments: segments.slice(0, 10),
      nextTopics: nextTopics.slice(0, 3),
      preferences: preferences.slice(0, 10),
    };
  } catch {
    return fallback;
  }
}
