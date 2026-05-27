// Phase V1 — 타임머신 AI 비서 백엔드.
// Phase V3 — 멀티턴(prior) + 컨텍스트 답 분기 추가.
// Phase V4 — "답의 깊이" (depth) 추가. 사용자는 "간단히/자세히/가장 정확하게"
// 를 고르고, 뒤에서 Haiku/Sonnet/Opus 로 라우팅. 모델 이름은 절대 노출 X.
// DB 답은 depth 무관(검증된 데이터).
//
// 입력: 사용자 질문(텍스트) + 맥락(targetYear, targetMonth) + userId
//       + 옵션 prior(이전 대화 턴) + 옵션 depth(기본 "simple")
// 출력: { text, source: "db" | "web" | "context", citations?,
//          tokensSpent, balanceAfter, events, songs, depth }
//
// 라우팅:
//   0) prior 가 비어있지 않으면 (= 후속 질문) → **컨텍스트 답 먼저 시도**.
//      이전 답들로만 답할 수 있으면 chat() 1회로 끝, 검색 호출 없음 →
//      매우 저렴. 이전 답에 답이 없으면 모델이 정확히 "[SEARCH]" 만 출력
//      하도록 가드 → 검색 폴백으로 떨어진다.
//   1) 첫 질문이거나 [SEARCH] 가 떨어지면 카테고리 분류 →
//      MUSIC / BIG / TASTE.
//   2) MUSIC, BIG → DB 시도 (ChartSong / MonthEvent 그달 노출 행).
//      결과 있으면 템플릿으로 조립 — AI 호출 0, 차감 0. depth 무관.
//   3) 결과 비었거나 TASTE → 웹 검색 (chatWithWebSearch + 가드 시스템
//      프롬프트). depth 에 따라 Haiku/Sonnet/Opus 호출. 토큰 차감 비례.
//
// 토큰 정책:
//   - DB 답 = 무료
//   - 컨텍스트 답 = tokensFromUsage(in,out) * MULTIPLIER[depth]
//     (Haiku 1x, Sonnet 3x, Opus 5x — 보통 1/3/5 토큰)
//   - 검색 답 = tokensFromUsage(in,out) * MULTIPLIER[depth] + 1
//     (+1 은 web_search 운영 비용, 모델 무관 고정)
//
// 호출자 (api route, UI) 가 결과를 그대로 사용자에게 노출. 단 model
// 이름은 응답에 포함되지 않고 depth 만 — UI 가 모델 노출 못 함.

import { chat, chatWithWebSearch, type Citation } from "./ai";
import { chargeOneShot, refundTokens } from "./tokens/charge";
import { InsufficientBalanceError } from "./tokens/errors";
import {
  MIN_BALANCE_TO_START_CYCLE,
  MODEL_MULTIPLIER,
  tokensFromUsage,
  type ModelTier,
} from "./tokens/policy";
import { getBalance } from "./tokens/wallet";
import { getMonthScreen } from "./timemachine";

export type AssistantCategory = "MUSIC" | "BIG" | "TASTE";
export type AssistantSource = "db" | "web" | "context";

// V4 — "답의 깊이". 사용자 라벨은 UI 에서 (간단히/자세히/가장 정확하게).
// 백엔드는 이 enum 으로 받음. 모델 ID 매핑은 DEPTH_TO_MODEL 한 곳.
export type AssistantDepth = "simple" | "detailed" | "precise";

export const DEFAULT_DEPTH: AssistantDepth = "simple";

export const DEPTH_TO_TIER: Record<AssistantDepth, ModelTier> = {
  simple: "haiku",
  detailed: "sonnet",
  precise: "opus",
};

const DEPTH_TO_MODEL: Record<AssistantDepth, string> = {
  simple: "claude-haiku-4-5-20251001",
  detailed: "claude-sonnet-4-6",
  precise: "claude-opus-4-7",
};

function modelFor(depth: AssistantDepth): string {
  return DEPTH_TO_MODEL[depth];
}

// depth 에 따른 추가 차감. 기본 baseTokens 는 chargeOneShot 내부의
// tokensFromUsage(in,out) 가 적용. surcharge = base * (multiplier - 1) +
// extra → 총 cost = base * multiplier + extra. Haiku(multiplier=1) 일 때
// surcharge=extra 라 기존 호출부 무영향.
function depthSurcharge(
  depth: AssistantDepth,
  baseTokens: number,
  extra: number = 0,
): number {
  const m = MODEL_MULTIPLIER[DEPTH_TO_TIER[depth]];
  return baseTokens * (m - 1) + extra;
}

// V2 — UI 가 답 옆에 SongCard / "내 타임라인에 추가" 버튼을 렌더하기
// 위해, DB 답일 때만 원시 사건/노래 데이터도 함께 반환한다. 검색·컨텍스트
// 답엔 비어있다 (사실 인용은 citations 로 표현).
export type AssistantEvent = {
  id: string;
  title: string;
  description: string;
  section: string;
};

export type AssistantSong = {
  rank: number | null;
  title: string;
  artist: string;
  eraColor: string | null;
};

// V3 — 멀티턴 입력. 클라이언트가 최근 대화를 그대로 보낸다.
export type AssistantPriorTurn = {
  role: "user" | "assistant";
  text: string;
};

export type AssistantResult = {
  text: string;
  source: AssistantSource;
  category: AssistantCategory;
  citations: Citation[];
  tokensSpent: number;
  balanceAfter: number;
  events: AssistantEvent[];
  songs: AssistantSong[];
  // V4 — 어떤 깊이로 답했는지. DB 답이어도 depth 는 입력 그대로 echo
  // (UI 가 현재 선택 상태를 표시하기 위함). DB 답은 차감 0 이지만 depth
  // 표시는 일관되게.
  depth: AssistantDepth;
};

// 검색 추가 비용 가산. web_search 1회 ≈ $0.01, 토큰 정책상 대략 1토큰.
const WEB_SEARCH_SURCHARGE_TOKENS = 1;

// V3 길이 가드 — 멀티턴에서 prior 가 그대로 쌓이면 입력 토큰이 폭주.
//   - 최근 8턴(보통 user 4 + assistant 4) 만 유지
//   - 각 텍스트 600자에서 자름 — 검색 답은 출처·이모지 포함해서 길 수 있음
const MAX_PRIOR_TURNS = 8;
const MAX_PRIOR_TEXT_CHARS = 600;

function clampPrior(prior: AssistantPriorTurn[]): AssistantPriorTurn[] {
  let recent = prior.slice(-MAX_PRIOR_TURNS);
  // B2 — Anthropic 은 첫 메시지가 user 여야 한다. slice 가 페어 한가운데를
  // 잘라 assistant 부터 시작하면 400. 앞쪽에서 assistant 가 나오면 한
  // 칸 더 자른다 (보통 1회로 끝, 안전을 위해 while).
  while (recent.length > 0 && recent[0].role !== "user") {
    recent = recent.slice(1);
  }
  return recent.map((t) => {
    const trimmed = t.text.trim();
    if (trimmed.length <= MAX_PRIOR_TEXT_CHARS) return { role: t.role, text: trimmed };
    return { role: t.role, text: trimmed.slice(0, MAX_PRIOR_TEXT_CHARS) + "…" };
  });
}

// B3 — Claude 가 빈 텍스트를 반환할 때 사용자 친화 안내. 차감 0.
const EMPTY_CONTEXT_NOTICE =
  "방금 한 이야기 안에서는 더 풀어드릴 게 없네요. 같은 질문을 다른 표현으로 다시 물어봐 주세요.";
const EMPTY_WEB_NOTICE =
  "지금은 좋은 답을 찾지 못했어요. 잠시 후 다시 물어봐 주세요.";

// 컨텍스트 답 sentinel — 모델이 정확히 이 문자열만 출력하면 검색 폴백.
// 정확 일치 + 시작 일치 두 가지로 허용 (모델이 가끔 줄바꿈/공백 붙임).
const SEARCH_SENTINEL = "[SEARCH]";

function isSearchSentinel(text: string): boolean {
  const t = text.trim();
  return t === SEARCH_SENTINEL || t.startsWith(SEARCH_SENTINEL);
}

// ──────────────────────────────────────────────────────────────────
// 1) 키워드 분류
// ──────────────────────────────────────────────────────────────────

const MUSIC_KEYWORDS = [
  "노래", "곡", "음악", "가수", "가요", "팝송", "팝", "차트", "인기곡",
  "유행가", "히트곡", "ost", "OST", "발라드", "댄스곡", "트로트",
];

const BIG_KEYWORDS = [
  "사건", "사고", "뉴스", "정치", "선거", "대통령", "정부", "국회",
  "올림픽", "월드컵", "스포츠", "재난", "참사", "시위", "파업", "전쟁",
  "테러", "외환위기", "imf", "IMF", "탄핵", "지진", "태풍",
];

const TASTE_KEYWORDS = [
  "드라마", "영화", "예능", "프로그램", "만화", "애니", "게임",
  "유행", "패션", "옷", "맛집", "음식", "물가", "살림", "동네",
  "장난감", "광고", "cf", "CF", "노래방", "PC방", "오락실",
];

function classifyQuestion(question: string): AssistantCategory {
  const q = question.toLowerCase();
  const hit = (kws: string[]) =>
    kws.some((k) => q.includes(k.toLowerCase()));
  // 우선순위: MUSIC > BIG > TASTE. "이때 노래 사건" 같이 둘 다 걸리면
  // 음악 의도일 가능성이 더 큼 (보통 사용자는 단일 의도로 묻는다).
  if (hit(MUSIC_KEYWORDS)) return "MUSIC";
  if (hit(BIG_KEYWORDS)) return "BIG";
  if (hit(TASTE_KEYWORDS)) return "TASTE";
  // 키워드 매칭 실패 → 안전한 default 는 TASTE (검색으로 보내는 것이
  // big 이벤트를 DB 에 없다고 오답하는 것보다 안전).
  return "TASTE";
}

// ──────────────────────────────────────────────────────────────────
// 2) DB 답 — 템플릿 조립 (AI 호출 0)
// ──────────────────────────────────────────────────────────────────

function formatMusicAnswer(
  year: number,
  month: number,
  domestic: { rank: number | null; title: string; artist: string }[],
  international: { rank: number | null; title: string; artist: string }[],
): string {
  const lines: string[] = [`${year}년 ${month}월에는 이런 곡들이 사랑받았어요.`];
  if (domestic.length > 0) {
    lines.push("");
    lines.push("국내:");
    const top = domestic.slice(0, 5);
    for (const s of top) {
      const r = s.rank ? `${s.rank}위. ` : "";
      const artist = s.artist ? ` — ${s.artist}` : "";
      lines.push(`  ${r}${s.title}${artist}`);
    }
  }
  if (international.length > 0) {
    lines.push("");
    lines.push("해외:");
    const top = international.slice(0, 3);
    for (const s of top) {
      const r = s.rank ? `${s.rank}위. ` : "";
      const artist = s.artist ? ` — ${s.artist}` : "";
      lines.push(`  ${r}${s.title}${artist}`);
    }
  }
  return lines.join("\n");
}

function formatBigAnswer(
  year: number,
  month: number,
  events: { section: string; title: string; description: string }[],
): string {
  const lines: string[] = [
    `${year}년 ${month}월에는 이런 일이 있었어요.`,
    "",
  ];
  // 정치/사회 우선, 스포츠 다음. CULTURE/TREND 는 big 답에는 안 넣음
  // (취향 영역).
  const ps = events.filter((e) => e.section === "POLITICS_SOCIETY").slice(0, 3);
  const sp = events.filter((e) => e.section === "SPORTS").slice(0, 2);
  for (const e of [...ps, ...sp]) {
    const desc = e.description ? ` — ${e.description}` : "";
    lines.push(`• ${e.title}${desc}`);
  }
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────
// 3) 가드 시스템 프롬프트 — 검색용 / 컨텍스트용
// ──────────────────────────────────────────────────────────────────

function searchSystemPrompt(year: number, month: number): string {
  return `당신은 한국 회상 서비스 'Lifebook' 의 비서입니다. 사용자는 ${year}년 ${month}월의 기억을 되살리는 중입니다.

웹 검색 결과를 토대로 짧고 따뜻하게 답하세요. 목적은 백과사전이 아니라 사용자의 기억을 자극할 실마리를 주는 것입니다.

검색 결과를 다루는 원칙 (가장 중요):
1. 답을 만들기 전에 검색 결과를 충분히 읽으세요. 결과가 빈약하거나 질문과 거리가 멀면 그 사실을 인정하세요 — 억지로 채우지 마세요.
2. 검색 결과에 명확히 등장하는 사실만 단정해서 말하세요. 출처에 근거가 없는 내용은 추측해서 채우지 마세요. 일반 상식이나 사전 학습 지식으로 빈칸을 메우지 마세요.
3. 검색에 분명히 나오지 않거나, 자료가 서로 다르거나, 한 출처만 있는 미확정 내용은 답 안에서 "확실하지 않다"는 표시를 함께 적으세요. 예: "확실한 건 ○○이고, △△는 자료마다 다르게 나와서 정확하지 않을 수 있어요." 또는 "□□는 정확한 자료를 못 찾았어요."
4. 모르거나 자료가 부족하면 솔직히 모른다고 답하세요. "그 부분은 정확한 자료를 못 찾았어요"라고 말하는 것은 잘못된 추측보다 훨씬 좋은 답입니다.

지켜야 할 선:
- 가사·기사 문장을 그대로 인용하거나 복제하지 마세요. 사실(제목·이름·시점·순위)만 우리 표현으로 짧게 요약하세요.
- 확실하지 않은 부분에는 "...였던 것 같아요", "정확하지 않을 수 있어요", "확인해보세요" 같은 조심스러운 표현을 함께 쓰세요.
- 사용자의 기억을 대신 만들어내지 마세요. "당신은 이랬을 거예요" 같은 추측은 금지입니다. 정보를 꺼내 주는 역할만.
- 음악 답은 곡명·아티스트·순위(사실)만. 이미지·재생·임베드는 절대 언급하지 마세요.
- 민감정보(건강·정치성향·종교·재산)는 사용자가 직접 묻지 않은 한 강조하지 마세요.
- 시니어 친화 어조: 차분하고 자연스럽게, 짧게.

출력 형식:
- 본문 2~4문장. 한국어. 머리말이나 "여기 답변입니다" 같은 군더더기 없이 바로 본문.
- 확실한 부분은 분명한 톤으로, 불확실한 부분은 조심스러운 톤으로 — 한 답 안에서 구분되게 적으세요.
- 자료가 거의 없을 때는 짧게 끝내도 좋습니다: "○○에 관한 자료는 거의 찾지 못했어요. 혹시 다른 키워드로 다시 물어봐 주세요." 정도.`;
}

// V3 — 컨텍스트(=이전 대화) 답 전용 system 프롬프트.
// 핵심:
//   - 외부 지식 금지, 이전 대화 안의 사실만.
//   - "풀어 설명"이 default — paraphrase/확장은 환영. 너무 보수적으로
//     SEARCH 던지지 않게 명시.
//   - 정말 새 사실이 필요할 때만 정확히 SEARCH_SENTINEL.
function contextSystemPrompt(year: number, month: number): string {
  return `당신은 한국 회상 서비스 'Lifebook' 의 비서입니다. 사용자는 ${year}년 ${month}월의 기억을 되살리는 중이고, 지금은 직전 대화의 후속 질문입니다.

기본 규칙:
- 직전 대화(이전 메시지들) 안에 이미 등장한 정보만 사용해 답하세요. 외부 지식을 새로 더하지 마세요.
- 사용자가 "자세히", "더 알려줘", "1번", "그게 뭐야" 같이 이전 답의 항목을 풀어 달라고 하면 — 그 항목을 한 번 더 자연스럽게, 다른 표현으로, 풀어서 설명하세요. 같은 사실을 친절하게 다시 말하는 것은 환영입니다.
- 항목이 어느 것인지 모호하면 (예: "1번이 뭐였지?") 이전 답에서 가장 먼저 등장한 항목을 가리키는 것으로 해석하세요.

정확히 다음 경우에만, 다른 어떤 텍스트도 없이 "${SEARCH_SENTINEL}" 한 단어만 출력하세요:
- 사용자가 묻는 구체적인 사실(예: 정확한 날짜, 인물의 다른 이름, 사건의 다른 측면, 새로운 항목)이 이전 대화에 전혀 등장하지 않았을 때.

지킬 선:
- 가사·기사 문장을 그대로 인용하거나 복제하지 마세요.
- 사용자의 기억을 대신 만들어내지 마세요 ("당신은 이랬을 거예요" 금지).
- 시니어 친화 어조: 차분하고 자연스럽게, 2~4문장.
- 출력에 머리말이나 "이전 답변에 따르면" 같은 군더더기 없이 바로 본문만.`;
}

// ──────────────────────────────────────────────────────────────────
// 4) 메인 진입점
// ──────────────────────────────────────────────────────────────────

export async function askAssistant(
  userId: string,
  question: string,
  targetYear: number,
  targetMonth: number,
  prior: AssistantPriorTurn[] = [],
  depth: AssistantDepth = DEFAULT_DEPTH,
): Promise<AssistantResult> {
  const q = question.trim();
  if (q === "") {
    throw new Error("empty question");
  }
  if (
    !Number.isInteger(targetYear) ||
    targetYear < 1900 ||
    !Number.isInteger(targetMonth) ||
    targetMonth < 1 ||
    targetMonth > 12
  ) {
    throw new Error("invalid target year/month");
  }

  const category = classifyQuestion(q);

  // ──────────────────────────────────────────────────────────────
  // V3 — 후속 질문이면 컨텍스트 답 먼저 시도. 가능하면 검색 안 함.
  // [SEARCH] 폴백 시에는 DB 분기 건너뛰고 바로 검색 — DB 는 첫 질문에서
  // 이미 답을 줬으므로 똑같은 답이 두 번 나오는 걸 막는다.
  // ──────────────────────────────────────────────────────────────
  if (prior.length > 0) {
    const balanceBefore = await getBalance(userId);
    if (balanceBefore < MIN_BALANCE_TO_START_CYCLE) {
      throw new InsufficientBalanceError();
    }

    const clamped = clampPrior(prior);
    const messages = [
      ...clamped.map((t) => ({ role: t.role, content: t.text })),
      { role: "user" as const, content: q },
    ];

    const ctx = await chat(messages, {
      system: contextSystemPrompt(targetYear, targetMonth),
      maxTokens: 512,
      temperature: 0.3,
      model: modelFor(depth),
    });

    if (!isSearchSentinel(ctx.text)) {
      // 컨텍스트만으로 답이 나왔다 — 검색 호출 없이 종료.
      // B3 — 빈 답이면 차감하지 않고 안내.
      if (ctx.text.trim() === "") {
        return {
          text: EMPTY_CONTEXT_NOTICE,
          source: "context",
          category,
          citations: [],
          tokensSpent: 0,
          balanceAfter: balanceBefore,
          events: [],
          songs: [],
          depth,
        };
      }
      // depth 별 차감 — Haiku 일 땐 surcharge=0 으로 현행 그대로,
      // Sonnet/Opus 는 base*(M-1) 가산.
      const baseCtx = tokensFromUsage(ctx.inputTokens, ctx.outputTokens);
      const charge = await chargeOneShot(
        userId,
        ctx.inputTokens,
        ctx.outputTokens,
        `timemachine_assistant_context_${depth}`,
        undefined,
        depthSurcharge(depth, baseCtx),
      );
      return {
        text: ctx.text,
        source: "context",
        category,
        citations: [],
        tokensSpent: charge.tokensSpent,
        balanceAfter: charge.balanceAfter,
        events: [],
        songs: [],
        depth,
      };
    }

    // [SEARCH] sentinel → 컨텍스트 시도 비용 차감 후 검색 직행.
    // DB 는 건너뛴다 — 후속 질문에서 같은 DB 답을 또 주는 건 무의미.
    const baseCtxMiss = tokensFromUsage(ctx.inputTokens, ctx.outputTokens);
    const ctxCharge = await chargeOneShot(
      userId,
      ctx.inputTokens,
      ctx.outputTokens,
      `timemachine_assistant_context_miss_${depth}`,
      undefined,
      depthSurcharge(depth, baseCtxMiss),
    );

    const balanceAfterCtx = await getBalance(userId);
    if (balanceAfterCtx < MIN_BALANCE_TO_START_CYCLE) {
      // T2 — 잔액 부족으로 검색 못 함 → 사용자가 답 못 받음 → 컨텍스트
      // 미스 차감을 환불해 손실 0 으로.
      await refundTokens(
        userId,
        ctxCharge.tokensSpent,
        "timemachine_assistant_context_miss_refund",
        ctxCharge.transactionId ?? undefined,
      );
      throw new InsufficientBalanceError();
    }

    const userMessage = `${targetYear}년 ${targetMonth}월에 관한 후속 질문입니다: "${q}"\n\n웹 검색으로 확인한 사실을 토대로 위 규칙을 지켜 답하세요. 가능하면 출처를 인용하세요.`;
    let search;
    try {
      search = await chatWithWebSearch(
        [{ role: "user", content: userMessage }],
        {
          system: searchSystemPrompt(targetYear, targetMonth),
          maxTokens: 1024,
          temperature: 0.4,
          maxSearches: 2,
          model: modelFor(depth),
        },
      );
    } catch (e) {
      // T2 — 검색 실패 → 사용자가 답 못 받음 → 컨텍스트 미스 차감 환불.
      await refundTokens(
        userId,
        ctxCharge.tokensSpent,
        "timemachine_assistant_context_miss_refund",
        ctxCharge.transactionId ?? undefined,
      );
      throw e;
    }

    // B3 — 검색이 성공했지만 빈 텍스트 → 사용자가 의미있는 답 못 받음 →
    // 컨텍스트 미스 차감 환불 + 검색 비용 차감 안 함.
    if (search.text.trim() === "") {
      await refundTokens(
        userId,
        ctxCharge.tokensSpent,
        "timemachine_assistant_context_miss_refund",
        ctxCharge.transactionId ?? undefined,
      );
      const balNow = await getBalance(userId);
      return {
        text: EMPTY_WEB_NOTICE,
        source: "web",
        category,
        citations: [],
        tokensSpent: 0,
        balanceAfter: balNow,
        events: [],
        songs: [],
        depth,
      };
    }

    const baseSearch = tokensFromUsage(search.inputTokens, search.outputTokens);
    const charge = await chargeOneShot(
      userId,
      search.inputTokens,
      search.outputTokens,
      `timemachine_assistant_web_${depth}`,
      undefined,
      depthSurcharge(depth, baseSearch, WEB_SEARCH_SURCHARGE_TOKENS),
    );
    return {
      text: search.text,
      source: "web",
      category,
      citations: search.citations,
      tokensSpent: charge.tokensSpent,
      balanceAfter: charge.balanceAfter,
      events: [],
      songs: [],
      depth,
    };
  }

  const balanceBefore = await getBalance(userId);

  // DB 시도 (MUSIC / BIG) — 결과 있으면 그대로 답, 토큰 차감 없음.
  if (category === "MUSIC") {
    const screen = await getMonthScreen(targetYear, targetMonth);
    if (
      screen.domesticSongs.length > 0 ||
      screen.internationalSongs.length > 0
    ) {
      const songs: AssistantSong[] = [
        ...screen.domesticSongs.slice(0, 5),
        ...screen.internationalSongs.slice(0, 3),
      ].map((s) => ({
        rank: s.rank,
        title: s.title,
        artist: s.artist,
        eraColor: s.eraColor,
      }));
      return {
        text: formatMusicAnswer(
          targetYear,
          targetMonth,
          screen.domesticSongs,
          screen.internationalSongs,
        ),
        source: "db",
        category,
        citations: [],
        tokensSpent: 0,
        balanceAfter: balanceBefore,
        events: [],
        songs,
        depth,
      };
    }
  }

  if (category === "BIG") {
    const screen = await getMonthScreen(targetYear, targetMonth);
    const big = screen.events.filter(
      (e) => e.section === "POLITICS_SOCIETY" || e.section === "SPORTS",
    );
    if (big.length > 0) {
      // 정치/사회 우선, 스포츠 다음 (formatBigAnswer 와 같은 순서).
      const ordered: AssistantEvent[] = [
        ...big.filter((e) => e.section === "POLITICS_SOCIETY").slice(0, 3),
        ...big.filter((e) => e.section === "SPORTS").slice(0, 2),
      ].map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        section: e.section,
      }));
      return {
        text: formatBigAnswer(targetYear, targetMonth, big),
        source: "db",
        category,
        citations: [],
        tokensSpent: 0,
        balanceAfter: balanceBefore,
        events: ordered,
        songs: [],
        depth,
      };
    }
  }

  // 여기까지 왔다 = TASTE 거나 DB 결과 비었음 → 웹 검색.
  // 사전 잔액 체크. AI 호출 자체 비용을 사용자가 못 낼 거 같으면 차단.
  if (balanceBefore < MIN_BALANCE_TO_START_CYCLE) {
    throw new InsufficientBalanceError();
  }

  const userMessage = `${targetYear}년 ${targetMonth}월에 관한 질문입니다: "${q}"\n\n웹 검색으로 확인한 사실을 토대로 위 규칙을 지켜 답하세요. 가능하면 출처를 인용하세요.`;

  const search = await chatWithWebSearch(
    [{ role: "user", content: userMessage }],
    {
      system: searchSystemPrompt(targetYear, targetMonth),
      maxTokens: 1024,
      temperature: 0.4,
      maxSearches: 2,
      model: modelFor(depth),
    },
  );

  // B3 — 검색이 빈 텍스트를 돌려주면 사용자에게 의미있는 답을 못 줬으니
  // 차감하지 않고 안내. (검색 호출 자체는 일어났지만 정책 일관성 — "답
  // 못 받으면 토큰 X" 을 우선.)
  if (search.text.trim() === "") {
    return {
      text: EMPTY_WEB_NOTICE,
      source: "web",
      category,
      citations: [],
      tokensSpent: 0,
      balanceAfter: balanceBefore,
      events: [],
      songs: [],
      depth,
    };
  }

  // 토큰 차감: tokensFromUsage(in,out) * MULTIPLIER[depth] + 검색 1 가산.
  const baseSearch = tokensFromUsage(search.inputTokens, search.outputTokens);
  const charge = await chargeOneShot(
    userId,
    search.inputTokens,
    search.outputTokens,
    `timemachine_assistant_web_${depth}`,
    undefined,
    depthSurcharge(depth, baseSearch, WEB_SEARCH_SURCHARGE_TOKENS),
  );

  return {
    text: search.text,
    source: "web",
    category,
    citations: search.citations,
    tokensSpent: charge.tokensSpent,
    balanceAfter: charge.balanceAfter,
    events: [],
    songs: [],
    depth,
  };
}
