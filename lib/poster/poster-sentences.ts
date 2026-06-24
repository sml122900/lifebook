// P3 — 포스터 문장 변환.
//
// 추출된 사건(정제 산문) → 포스터에 얹을 두 형태 문장으로 변환:
//   - nodeLabel : 노드용. 짧고 담백한 명사형 사건명(감정 X). 연도는 노드가
//                 따로 표시하므로 라벨엔 넣지 않는다. 예: "결혼", "독일 함부르크".
//   - memoText  : 메모용. 1인칭 표준 반말 회상체(감정 담되 음슴체 X). 짧게
//                 1~3문장. 예: "오빠가 피아노 치는 모습을 보던 게 내 음악
//                 인생의 시작이 되었네".
//
// ★ 프라이버시: 입력은 이미 리댁션·추출을 거친 사건이다. 여기서 신상·사실을
//   새로 창작하지 않는다(감정만 입히고, 없는 사실 추가 금지).
//
// 이 모듈은 변환 로직만. 사건 선별·노드/메모 구분·포스터 합성은 후속(P1·P2·P4).

import { chat } from "../ai";

export const POSTER_SENTENCE_MODEL =
  process.env.POSTER_SENTENCE_MODEL ?? "claude-sonnet-4-6";

export type PosterEventInput = {
  title: string;
  content: string | null;
  year: number | null;
};

export type PosterSentence = {
  nodeLabel: string;
  memoText: string;
};

const NODE_LABEL_MAX = 30;
const MEMO_MAX = 200;

const SYSTEM_PROMPT = `당신은 어르신의 인생 사건을 포스터(인생 나무)에 얹을 문장으로 다듬는 작가입니다.
반드시 유효한 JSON 배열만 출력하세요. 설명·다른 텍스트는 절대 출력하지 마세요.`;

function buildUserMsg(events: PosterEventInput[]): string {
  const list = events
    .map((e, i) => {
      const yr = e.year != null ? `${e.year}년` : "연도미상";
      const body = e.content?.trim() ? e.content.trim().slice(0, 600) : "(내용 없음)";
      return `[${i}] (${yr}) 제목: ${e.title}\n내용: ${body}`;
    })
    .join("\n\n");

  return `아래 사건들을 각각 포스터용 두 문장으로 바꿔주세요.

입력 순서대로 같은 개수의 JSON 배열을 출력하세요:
[{"nodeLabel":"...","memoText":"..."}]

[nodeLabel — 노드용]
- 짧고 담백한 명사형 사건명. 예: "결혼", "독일 함부르크", "콩쿠르 3등", "딸·아들 출산".
- 감정·수식 없이 무엇이었는지만. 연도는 넣지 마세요(노드가 따로 표시).
- ${NODE_LABEL_MAX}자 이내.

[memoText — 메모용]
- 1인칭("나/내") 표준 반말 회상체. 어미는 "~했어/~몰랐어/~되었네/~그렸지" 같은 회상체.
- 감정을 담되 따뜻하고 담담하게. ★존엄: 결핍·불쌍하게 그리지 마세요.
- 짧게 1~3문장(포스터 여백에 들어갈 길이).
- 예: "오빠가 피아노 치는 모습을 보던 게 내 음악 인생의 시작이 되었네", "숙재랑 유치원 때부터 이어진 인연이 평생 갈 줄은 몰랐어".

[규칙]
- 사투리·말투 반영하지 말고 표준 반말 회상체로 통일.
- ★음슴체 금지: "~함/~였음/~음" 같은 어미 쓰지 말고 "~했어/~였어"로.
- ★사실 왜곡 금지: 입력 내용에 없는 사실·신상을 새로 만들지 마세요. 감정만 입히세요.

---사건---
${list}
---끝---`;
}

// 파싱 실패·항목 누락 시 안전한 기본값(원본에서 최소 구성).
function fallbackSentence(e: PosterEventInput): PosterSentence {
  return {
    nodeLabel: e.title.slice(0, NODE_LABEL_MAX),
    memoText: (e.content?.trim() || e.title).slice(0, MEMO_MAX),
  };
}

function parseSentences(
  raw: string,
  events: PosterEventInput[],
): PosterSentence[] {
  let arr: unknown[] = [];
  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = [];
  }

  // 입력 순서·개수에 맞춰 매핑. 누락·형식오류는 항목별 fallback.
  return events.map((e, i) => {
    const item = arr[i];
    if (!item || typeof item !== "object") return fallbackSentence(e);
    const obj = item as Record<string, unknown>;
    const nodeLabel =
      typeof obj.nodeLabel === "string" && obj.nodeLabel.trim()
        ? obj.nodeLabel.trim().slice(0, NODE_LABEL_MAX)
        : fallbackSentence(e).nodeLabel;
    const memoText =
      typeof obj.memoText === "string" && obj.memoText.trim()
        ? obj.memoText.trim().slice(0, MEMO_MAX)
        : fallbackSentence(e).memoText;
    return { nodeLabel, memoText };
  });
}

// 사건 여러 개 → 포스터 문장 배열(입력 순서·개수 보존). 한 번의 LLM 호출.
export async function refineForPosterBatch(
  events: PosterEventInput[],
): Promise<PosterSentence[]> {
  if (events.length === 0) return [];

  const res = await chat([{ role: "user", content: buildUserMsg(events) }], {
    system: SYSTEM_PROMPT,
    model: POSTER_SENTENCE_MODEL,
    maxTokens: 2048,
    temperature: 0.5, // 감정·문장 다양성 약간
  });

  return parseSentences(res.text, events);
}

// 사건 1건 → 포스터 문장.
export async function refineForPoster(
  event: PosterEventInput,
): Promise<PosterSentence> {
  const [out] = await refineForPosterBatch([event]);
  return out ?? fallbackSentence(event);
}
