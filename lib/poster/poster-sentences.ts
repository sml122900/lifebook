// P3 — 포스터 문장 변환.
//
// 추출된 사건(정제 산문) → 포스터에 얹을 두 형태 문장으로 변환:
//   - nodeLabel : 노드용. 짧고 담백한 명사형 사건명(감정 X). 연도는 노드가
//                 따로 표시하므로 라벨엔 넣지 않는다. 예: "결혼", "독일 함부르크".
//   - memoText  : 메모용. 사용자가 한 말을 그대로, 공백 포함 60자 이내로. 60자
//                 이내 원문은 코드가 그대로 쓰고, 넘는 원문만 AI 가 핵심 한두 문장을
//                 원래 말 그대로 고른다(프롬프트 목표 50자, 빠진 주어는 원문 표현 그대로
//                 붙여도 됨) — 해석·감정·교훈·평가·없는 사실은 더하지 않고, 음슴체·구어체
//                 등 원문 말투를 유지(v4). 60자를 넘긴 응답은 1회 재요청, 또 넘으면 기본값.
//
// ★ 프라이버시: 입력은 이미 리댁션·추출을 거친 사건이다. 여기서 신상·사실을
//   새로 창작하지 않는다(없는 사실·감정 추가 금지).
//
// 이 모듈은 변환 로직만. 사건 선별·노드/메모 구분·포스터 합성은 후속(P1·P2·P4).

import { chat } from "../ai";

const POSTER_SENTENCE_MODEL =
  process.env.POSTER_SENTENCE_MODEL ?? "claude-sonnet-4-6";

// 프롬프트 버전 — 저장 문장의 원본 해시에 들어간다(lib/poster/ai-cache.ts). 프롬프트를
// 바꾸면 올려서 저장해 둔 문장이 해시 불일치로 다시 만들어지게 한다.
// 1 = 표준 반말 회상체·감정 입히기(버전 상수 도입 전), 2 = 원문 보존(2026-10-24),
// 3 = 메모 공백 포함 60자 상한·초과 시 핵심 한두 문장 그대로(2026-10-24),
// 4 = 프롬프트 목표 50자(서버 검증 60자)·빠진 주어는 원문 표현 그대로 붙여도 됨(2026-10-24).
export const P3_PROMPT_VERSION = 4;

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
const MEMO_MAX = 200; // 기본값(원문) 메모 자르기
// 메모 상한(공백 포함). 원문이 이 안이면 원문 그대로, AI 메모가 넘으면 AI 결과로 치지 않는다
// (같은 로드에서 1회 재요청, 또 넘으면 저장 안 함 → 다음 로드에 재요청).
export const MEMO_AI_MAX = 60;
// 프롬프트에 주는 메모 목표 길이 — 모델이 글자 수를 정확히 못 세서(61~64자로 넘김 6/40 실측)
// 서버 상한보다 여유를 둔다.
const MEMO_PROMPT_MAX = 50;

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

[memoText — 메모용] ★원칙: 사용자가 한 말을 그대로 옮기고, 길이만 맞추세요.
- 길이: 공백 포함 ${MEMO_PROMPT_MAX}자 이내.
- 내용이 ${MEMO_PROMPT_MAX}자 이내면 한 글자도 빼지 말고 그대로 쓰세요(맞춤법 정리만 허용).
- ${MEMO_PROMPT_MAX}자를 넘으면 내용 전체를 조금씩 줄이지 말고, 가장 핵심인 한두 문장(또는 구절)을 골라 원래 말 그대로 옮기세요.
- 고른 문장에서 누가 한 일인지(주어)가 빠지면, 원문에 있던 주어 표현을 원래 말 그대로 앞에 붙여도 됩니다. 그 밖에는 아무것도 덧붙이지 마세요.
- 원문의 어휘와 말투를 최대한 유지하세요. 음슴체("~함/~였음")·구어체도 그대로 두고, 다른 문체로 바꾸지 마세요.
- 맞춤법·띄어쓰기는 바로잡아도 됩니다. 말투가 드러나는 입말(예: "~거 같애", "~할라고")은 고치지 마세요.
- ★사용자가 말하지 않은 해석·감정·교훈·평가를 덧붙이지 마세요(예: "삶의 뿌리가 되었네", "단단해졌어" 같은 말).
- ★원문에 없는 사실·장면·인물·디테일을 더하지 마세요.
- 내용이 없으면 제목을 그대로 쓰세요.

[규칙]
- ★사실 왜곡 금지: 입력 내용에 없는 사실·신상을 새로 만들지 마세요.

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

// 필드별 AI 결과 여부 — false 면 그 필드는 기본값.
export type SentenceFromAi = Record<keyof PosterSentence, boolean>;

// fromAi[i].nodeLabel/memoText=false 는 그 필드를 응답에서 못 읽었거나(응답 전체를 못 읽으면
// 전부 false) 메모가 상한을 넘어 기본값이 들어간 것. memoTooLong[i] 은 뒤쪽(AI 메모가 상한 초과).
function parseSentences(
  raw: string,
  events: PosterEventInput[],
): { sentences: PosterSentence[]; fromAi: SentenceFromAi[]; memoTooLong: boolean[] } {
  let arr: unknown[] | null = null;
  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = null;
  }
  const list = arr ?? [];

  // 입력 순서·개수에 맞춰 매핑. 누락·형식오류·메모 상한 초과는 필드별 fallback(그 필드 fromAi=false).
  const fromAi: SentenceFromAi[] = [];
  const memoTooLong: boolean[] = [];
  const sentences = events.map((e, i) => {
    const item = list[i];
    const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const nodeLabel = typeof obj.nodeLabel === "string" ? obj.nodeLabel.trim().slice(0, NODE_LABEL_MAX) : "";
    // 원문이 상한 이내면 AI 메모 대신 원문 그대로 — 모델은 글자 수를 못 세서 58자 원문도
    // 줄였다(2026-10-24 실측, 결정: 성민). 상한을 넘는 원문만 AI 메모를 쓴다.
    const content = e.content?.trim() ?? "";
    const memoText =
      content !== "" && content.length <= MEMO_AI_MAX
        ? content
        : typeof obj.memoText === "string"
          ? obj.memoText.trim()
          : "";
    const ok = { nodeLabel: nodeLabel !== "", memoText: memoText !== "" && memoText.length <= MEMO_AI_MAX };
    fromAi.push(ok);
    memoTooLong.push(memoText.length > MEMO_AI_MAX);
    const fallback = fallbackSentence(e);
    return {
      nodeLabel: ok.nodeLabel ? nodeLabel : fallback.nodeLabel,
      memoText: ok.memoText ? memoText : fallback.memoText,
    };
  });
  return { sentences, fromAi, memoTooLong };
}

async function requestSentences(events: PosterEventInput[]) {
  const res = await chat([{ role: "user", content: buildUserMsg(events) }], {
    system: SYSTEM_PROMPT,
    model: POSTER_SENTENCE_MODEL,
    maxTokens: 2048,
    temperature: 0.5, // 감정·문장 다양성 약간
  });
  return parseSentences(res.text, events);
}

// 사건 여러 개 → 포스터 문장 배열(입력 순서·개수 보존). types[i] = 그 사건을 담을 유형.
// 메모 항목의 AI 메모가 상한을 넘으면 그 항목만 모아 1회 다시 요청한다(같은 로드 안).
// fromAi[i] 의 필드가 false 면 그 필드는 기본값 — 호출자는 그 필드 문장을 저장·고정하지 않는다.
export async function refineForPosterBatch(
  events: PosterEventInput[],
  types: ("node" | "memo")[],
): Promise<{ sentences: PosterSentence[]; fromAi: SentenceFromAi[] }> {
  if (events.length === 0) return { sentences: [], fromAi: [] };

  const { sentences, fromAi, memoTooLong } = await requestSentences(events);
  const retry = memoTooLong.flatMap((long, i) => (long && types[i] === "memo" ? [i] : []));
  if (retry.length > 0) {
    const again = await requestSentences(retry.map((i) => events[i]));
    // 다시 받은 메모만 바꾼다(또 넘으면 기본값 그대로·저장 안 함). 노드 라벨은 첫 응답 것.
    retry.forEach((i, j) => {
      if (!again.fromAi[j].memoText) return;
      sentences[i] = { ...sentences[i], memoText: again.sentences[j].memoText };
      fromAi[i] = { ...fromAi[i], memoText: true };
    });
  }
  return { sentences, fromAi };
}
