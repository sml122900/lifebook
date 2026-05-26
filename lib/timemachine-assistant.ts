// Phase V1 — 타임머신 AI 비서 백엔드.
//
// 입력: 사용자 질문(텍스트) + 맥락(targetYear, targetMonth) + userId
// 출력: { text, source: "db" | "web", citations?, tokensSpent, balanceAfter }
//
// 라우팅 (lib/timemachine-assistant 의 핵심):
//   1) 키워드로 카테고리 분류 → MUSIC / BIG / TASTE
//   2) MUSIC, BIG → DB 시도 (ChartSong / MonthEvent 그달 노출 행).
//      결과 있으면 템플릿으로 조립 — AI 호출 0, 차감 0.
//   3) 결과 비었거나 TASTE → 웹 검색 (chatWithWebSearch + 가드 시스템
//      프롬프트). 토큰 차감.
//
// 토큰 정책:
//   - DB 답 = 무료
//   - 검색 답 = tokensFromUsage(in,out) + 1 (web_search 자체 비용 가산).
//     검색 1회 + 짧은 요약(~1000~2000토큰)이면 잠정 2~3토큰.
//
// 호출자 (api route, 추후 UI) 가 결과를 그대로 사용자에게 노출.

import { chatWithWebSearch, type Citation } from "./ai";
import { prisma } from "./db";
import { chargeOneShot } from "./tokens/charge";
import { InsufficientBalanceError } from "./tokens/errors";
import { MIN_BALANCE_TO_START_CYCLE } from "./tokens/policy";
import { getBalance } from "./tokens/wallet";
import { getMonthScreen } from "./timemachine";

export type AssistantCategory = "MUSIC" | "BIG" | "TASTE";
export type AssistantSource = "db" | "web";

// V2 — UI 가 답 옆에 SongCard / "내 타임라인에 추가" 버튼을 렌더하기
// 위해, DB 답일 때만 원시 사건/노래 데이터도 함께 반환한다. 검색 답엔
// 비어있다 (사실 인용은 citations 로 표현).
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

export type AssistantResult = {
  text: string;
  source: AssistantSource;
  category: AssistantCategory;
  citations: Citation[];
  tokensSpent: number;
  balanceAfter: number;
  events: AssistantEvent[];
  songs: AssistantSong[];
};

// 검색 추가 비용 가산. web_search 1회 ≈ $0.01, 토큰 정책상 대략 1토큰.
const WEB_SEARCH_SURCHARGE_TOKENS = 1;

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
// 3) 검색 가드 시스템 프롬프트
// ──────────────────────────────────────────────────────────────────

function searchSystemPrompt(year: number, month: number): string {
  return `당신은 한국 회상 서비스 'Lifebook' 의 비서입니다. 사용자는 ${year}년 ${month}월의 기억을 되살리는 중입니다.

웹 검색 결과를 토대로 짧고 따뜻하게 답하세요. 목적은 백과사전이 아니라 사용자의 기억을 자극할 실마리를 주는 것입니다.

지켜야 할 선:
- 가사·기사 문장을 그대로 인용하거나 복제하지 마세요. 사실(제목·이름·시점·순위)만 우리 표현으로 짧게 요약하세요.
- 확실하지 않으면 단정하지 마세요. "...였던 것 같아요", "확인해보세요" 같은 조심스러운 톤을 유지하세요.
- 사용자의 기억을 대신 만들어내지 마세요. "당신은 이랬을 거예요" 같은 추측은 금지입니다. 정보를 꺼내 주는 역할만.
- 음악 답은 곡명·아티스트·순위(사실)만. 이미지·재생·임베드는 절대 언급하지 마세요.
- 민감정보(건강·정치성향·종교·재산)는 사용자가 직접 묻지 않은 한 강조하지 마세요.
- 시니어 친화 어조: 차분하고 자연스럽게, 짧게.

출력 형식:
- 본문 2~4문장. 한국어. 머리말이나 "여기 답변입니다" 같은 군더더기 없이 바로 본문.
- 검색에서 확인된 사실이면 그 톤을 유지하고, 모호하면 모호한 톤을 유지하세요.`;
}

// ──────────────────────────────────────────────────────────────────
// 4) 메인 진입점
// ──────────────────────────────────────────────────────────────────

export async function askAssistant(
  userId: string,
  question: string,
  targetYear: number,
  targetMonth: number,
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
    },
  );

  // 토큰 차감: tokensFromUsage(in,out) + 검색 1회 가산. chargeOneShot
  // 의 surcharge 파라미터로 web_search 운영 비용을 표현.
  const charge = await chargeOneShot(
    userId,
    search.inputTokens,
    search.outputTokens,
    "timemachine_assistant_web",
    undefined,
    WEB_SEARCH_SURCHARGE_TOKENS,
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
  };
}
