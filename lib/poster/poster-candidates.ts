// P1 — 포스터 후보 선별 + 노드/메모 1차 분류.
//
// 사용자 life_event 전체 → AI(Sonnet)가:
//   1. 포스터에 담을 만한 사건 추천(인생에서 의미있는 것 우선 = priority)
//   2. 노드(큰 사건) / 메모(자잘·감정·에피소드) 1차 분류
//        - node : 인생 분기 (출생·입학·졸업·결혼·이주·출산·취업 등)
//        - memo : 자잘한 일상·감정·별명·친구·짝사랑·에피소드
//
// 합성 방식 b 확정 — 노드 슬롯 고정 없음(사건 N개 = 노드 N개 동적). 그래서
// "템플릿 슬롯 맞춤" 불필요. 여기선 분류·우선순위만.
//
// 사용자 최종 선택(최대 20개)은 P2 UI, SVG 합성은 P4.
// preferences(취향, S6 분리분)는 *포스터 후보 아님* → 디자인용(P5). 여기 입력에
//   안 섞는다(호출자가 life_event 만 넘김).
//
// 미리보기 문장(nodeLabel/memoText, P3 refineForPoster)은 사용자가 P2 에서
//   고른 것만 변환하는 게 효율적이라 여기 후보엔 안 붙인다(분류·요지까지만).

import { chat } from "../ai";

export const POSTER_CANDIDATE_MODEL =
  process.env.POSTER_CANDIDATE_MODEL ?? "claude-sonnet-4-6";

export type PosterCandidateInput = {
  eventId: string;
  year: number | null;
  title: string;
  content: string | null;
  category: string | null;
};

export type PosterCandidate = {
  eventId: string;
  year: number | null;
  title: string;
  suggestedType: "node" | "memo";
  gist: string; // 사건 요지 (한 줄)
  priority: number; // 1~5 (5 = 인생에서 가장 의미있어 포스터에 꼭)
  recommended: boolean; // AI 가 포스터에 담을 만하다고 보는지
};

const GIST_MAX = 60;

const SYSTEM_PROMPT = `당신은 어르신의 인생 사건을 인생 나무 포스터에 담기 위해 분류하는 큐레이터입니다.
반드시 유효한 JSON 배열만 출력하세요. 설명·다른 텍스트는 절대 출력하지 마세요.`;

function buildUserMsg(events: PosterCandidateInput[]): string {
  const list = events
    .map((e, i) => {
      const yr = e.year != null ? `${e.year}년` : "연도미상";
      const cat = e.category ? ` [${e.category}]` : "";
      const body = e.content?.trim() ? e.content.trim().slice(0, 300) : "(내용 없음)";
      return `[${i}] (${yr})${cat} 제목: ${e.title}\n내용: ${body}`;
    })
    .join("\n\n");

  return `아래 사건들을 인생 나무 포스터용으로 분류해 주세요.

입력 순서대로 같은 개수의 JSON 배열을 출력하세요:
[{"suggestedType":"node","gist":"...","priority":5,"recommended":true}]

[suggestedType]
- "node" = 인생의 큰 분기. 출생·입학·졸업·결혼·이주(유학·이민)·출산·취업·은퇴 등 인생 줄기.
- "memo" = 자잘한 일상·감정·별명·친구·짝사랑·에피소드. 큰 분기는 아니지만 그 사람다운 이야기.

[gist] 한 줄 요지(${GIST_MAX}자 이내). 무엇이었는지 담백하게.

[priority] 1~5. 5 = 인생에서 가장 의미있어 포스터에 꼭 담을 만함, 1 = 있어도 그만.
- node 라고 무조건 높은 건 아님. 사건의 인생 비중으로 판단.

[recommended] 포스터에 담을 만하면 true. 너무 사소하거나 단순 정보뿐이면 false.
- ★취향·선호(좋아하는 색·꽃·음식·계절·성격)만 있는 항목이 있으면 recommended:false (포스터 후보 아님, 디자인용으로 따로 씀).

[규칙] 넉넉히 추천하세요(사용자가 최종 20개 이내로 추립니다). 사실을 새로 만들지 마세요.

---사건---
${list}
---끝---`;
}

function fallbackCandidate(e: PosterCandidateInput): PosterCandidate {
  return {
    eventId: e.eventId,
    year: e.year,
    title: e.title,
    suggestedType: "node",
    gist: e.title.slice(0, GIST_MAX),
    priority: 3,
    recommended: true,
  };
}

function parseCandidates(
  raw: string,
  events: PosterCandidateInput[],
): PosterCandidate[] {
  let arr: unknown[] = [];
  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = [];
  }

  return events.map((e, i) => {
    const item = arr[i];
    if (!item || typeof item !== "object") return fallbackCandidate(e);
    const obj = item as Record<string, unknown>;

    const suggestedType: "node" | "memo" =
      obj.suggestedType === "memo" ? "memo" : "node";
    const gist =
      typeof obj.gist === "string" && obj.gist.trim()
        ? obj.gist.trim().slice(0, GIST_MAX)
        : e.title.slice(0, GIST_MAX);
    const priorityRaw =
      typeof obj.priority === "number" ? Math.round(obj.priority) : 3;
    const priority = Math.min(5, Math.max(1, priorityRaw));
    const recommended = obj.recommended !== false; // 기본 true

    return {
      eventId: e.eventId,
      year: e.year,
      title: e.title,
      suggestedType,
      gist,
      priority,
      recommended,
    };
  });
}

// 사용자 life_event 전체 → 포스터 후보(분류·우선순위). 한 번의 LLM 호출.
// 입력 순서·개수 보존, eventId 는 입력에서 그대로 echo(AI 출력 불신뢰).
export async function selectPosterCandidates(
  events: PosterCandidateInput[],
): Promise<PosterCandidate[]> {
  if (events.length === 0) return [];

  // AI 호출 실패(타임아웃·레이트리밋·키 오류)가 /poster/select 페이지 전체를
  // 500 으로 무너뜨리지 않도록 폴백. river→select 진입이 AI 가용성에 매이면 안 됨.
  let res;
  try {
    res = await chat([{ role: "user", content: buildUserMsg(events) }], {
      system: SYSTEM_PROMPT,
      model: POSTER_CANDIDATE_MODEL,
      maxTokens: 3072,
      temperature: 0.3,
    });
  } catch (e) {
    console.error("[poster] 후보 분류 AI 실패 — 폴백 사용", e instanceof Error ? e.message : e);
    return events.map(fallbackCandidate);
  }

  return parseCandidates(res.text, events);
}
