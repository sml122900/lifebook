// Phase 10 Phase 2 — 통녹음 전사를 시간순 사건 조각으로 분할.
//
// Claude 가 시기·주제 전환점을 찾아 각 조각에 제목·연도·카테고리를 추론.
// 별도 토큰 차감 없음 — STT 분당 요금에 포함(후처리).
//
// 환경변수 FREE_RECORDING_SPLIT_MODEL 로 모델 오버라이드 가능.

import { chat } from "./ai";

export const SPLIT_MODEL =
  process.env.FREE_RECORDING_SPLIT_MODEL ?? "claude-sonnet-4-6";

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
};

const SYSTEM_PROMPT = `당신은 어르신의 구술 회상을 시간순 이야기 조각으로 나누는 역할을 합니다.
반드시 유효한 JSON 만 출력하세요. 설명이나 다른 텍스트는 절대 출력하지 마세요.`;

export async function splitRecordingTranscript(
  transcript: string,
  topicTitle: string,
  birthYear: number | null,
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
    };
  }

  const birthLine = birthYear != null ? `출생연도: ${birthYear}` : "출생연도: 모름";
  const catList = [...VALID_CATEGORIES].join("/");

  const userMsg = `물꼬(주제): ${topicTitle}
${birthLine}

---전사---
${trimmed.slice(0, 12000)}
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
  "nextTopics": ["후속 주제나 질문", "또 다른 질문"]
}

분할 규칙:
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
      maxTokens: 2048,
      temperature: 0.3,
    },
  );

  return parseResponse(res.text, topicTitle, trimmed);
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
  };

  try {
    // 코드블록 래핑 제거
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as {
      segments?: unknown[];
      nextTopics?: unknown[];
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

    if (segments.length === 0) return fallback;
    return { segments: segments.slice(0, 10), nextTopics: nextTopics.slice(0, 3) };
  } catch {
    return fallback;
  }
}
