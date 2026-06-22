// 동반자 세션 후처리 — transcript 포맷팅 + 인물 추출.
//
// 서버 전용 (Claude 호출 포함).
//
// 인물 추출 모델: Sonnet 권장. 가족 관계 disambiguation이 reasoning이 필요함
// (예: "정훈모=언니 스승" vs "어르신 스승" 구분, 동명이인 오빠/언니 구분).
// 대화당 1콜이라 비용 무시. env 오버라이드: COMPANION_EXTRACT_MODEL

import { chat } from "./ai";

const OPENING_TRIGGER_PREFIX = "[대화 시작]";

// 인물 추출 — Sonnet. 가족 관계 disambiguation 은 reasoning 요구.
// 사건 분할(splitRecordingTranscript)도 Sonnet(FREE_RECORDING_SPLIT_MODEL) 으로
// 통일 — 대화당 각 1콜이라 비용 영향 미미.
const PEOPLE_EXTRACT_MODEL =
  process.env.COMPANION_EXTRACT_MODEL ?? "claude-sonnet-4-6";

export type TranscriptMessage = {
  speaker: "elder" | "companion";
  text: string;
};

export type ExtractedPerson = {
  name: string;
  relation: string | null;
  memo: string | null;
};

// ChatMessage[] → 저장용 TranscriptMessage[] (OPENING_TRIGGER 메타 제거).
// role:"user" = elder, role:"assistant" = companion.
export function historyToTranscript(
  history: { role: "user" | "assistant"; content: string }[],
): TranscriptMessage[] {
  return history
    .filter((h) => !(h.role === "user" && h.content.startsWith(OPENING_TRIGGER_PREFIX)))
    .map((h) => ({
      speaker: h.role === "user" ? ("elder" as const) : ("companion" as const),
      text: h.content,
    }));
}

// TranscriptMessage[] → 한글 대화 텍스트 (splitRecordingTranscript 입력용).
export function transcriptToSplitText(messages: TranscriptMessage[]): string {
  return messages
    .map((m) => `[${m.speaker === "elder" ? "어르신" : "동반자"}]: ${m.text}`)
    .join("\n");
}

// 대화에서 언급된 실제 인물 추출 (Sonnet, 서버).
// 추출 실패 시 [] 반환 — 호출자가 실패 무시하고 계속하도록.
export async function extractPeopleFromTranscript(
  conversationText: string,
): Promise<ExtractedPerson[]> {
  if (!conversationText.trim()) return [];

  const userMsg = `다음 대화에서 언급된 실제 인물(가족·친구·직장 동료 등)만 추출하세요.
장소명·사물·동물·역사적 인물(대통령·연예인 등)·단순 직책("선생님""사장님")은 제외하세요.
같은 이름이 여러 사람일 때, 문맥으로 관계를 구분하세요(예: 언니 스승 ≠ 어르신 스승).
반드시 유효한 JSON 배열만 출력하세요:
[{"name":"이름","relation":"관계(예:남동생)","memo":"한 줄 특징"}]
인물이 없으면: []

---대화---
${conversationText.slice(0, 8000)}
---끝---`;

  try {
    const res = await chat([{ role: "user", content: userMsg }], {
      system: "유효한 JSON 배열만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.",
      model: PEOPLE_EXTRACT_MODEL,
      maxTokens: 512,
      temperature: 0.1,
    });

    const cleaned = res.text.trim()
      .replace(/^```json\s*|^```\s*/i, "")
      .replace(/\s*```$/, "");
    const arr = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(arr)) return [];

    return arr
      .filter((x): x is Record<string, unknown> =>
        x !== null && typeof x === "object" && typeof (x as Record<string, unknown>).name === "string",
      )
      .map((x) => ({
        name: String(x.name).trim().slice(0, 50),
        relation: typeof x.relation === "string" ? x.relation.trim().slice(0, 30) || null : null,
        memo: typeof x.memo === "string" ? x.memo.trim().slice(0, 100) || null : null,
      }))
      .filter((p) => p.name.length > 0);
  } catch (e) {
    console.error("[companion/extract-people]", e instanceof Error ? e.message : e);
    return [];
  }
}
