// Phase T4 — 음성으로 받아쓴 텍스트를 AI 로 다듬는다.
//
// RAG 가드 (CLAUDE.md / Phase 7 패턴 동일):
//   - 사용자가 직접 말한 내용만 다듬는다 — 사람·장소·감정·디테일 추가 금지
//   - 추측·해석·과장 금지
//   - 길이 ±20% 이내로 유지
//
// memory-chat.ts 의 SUMMARIZE_SYSTEM_PROMPT 와 같은 가드 톤. temperature
// 도 그쪽(0.4)에 맞춰 낮게 — 창작 여지 최소화.
//
// 호출자(cleanup-action) 는 이 함수의 반환 in/out 토큰을 chargeOneShot 에
// 그대로 넘겨 차감한다.

import { chat } from "./ai";

const SYSTEM_PROMPT = `당신은 사용자가 음성으로 말한 한국어 받아쓰기 결과를 깔끔한 한 단락으로 다듬는 편집자입니다.

규칙:
- 사용자가 직접 말한 내용만 다듬으세요. 사용자가 말하지 않은 사람·장소·감정·디테일을 새로 만들어내지 마세요.
- 추측·해석·과장 금지. 사용자가 모호하게 말한 것을 명확하게 만든다는 핑계로 살을 붙이지 마세요.
- 시제·맞춤법·문장부호를 정리하고 자연스럽게 잇되, 길이는 원래 말한 길이 ±20% 이내로 유지하세요.
- "어", "음", "그", "뭐" 같은 군더더기는 제거하세요.
- 욕설·비속어는 부드럽게 바꿔주세요.
- 시니어 친화 어조: 차분하고 자연스럽게.
- 민감정보(건강, 정치성향, 종교, 재산)는 사용자가 직접 말한 그대로만 두고 따로 강조하지 마세요.

출력: 다듬은 본문 한 단락만. 인사·설명·"여기 다듬은 문장입니다" 같은 머리말이나 결말은 절대 출력하지 마세요.`;

export type CleanupResult = {
  cleaned: string;
  inputTokens: number;
  outputTokens: number;
};

export async function cleanupVoiceText(rawText: string): Promise<CleanupResult> {
  const trimmed = rawText.trim();
  if (trimmed === "") {
    return { cleaned: "", inputTokens: 0, outputTokens: 0 };
  }

  const res = await chat(
    [{ role: "user", content: trimmed }],
    {
      system: SYSTEM_PROMPT,
      // 길이는 입력의 ±20% 이내 규칙이지만, 모델 출력 cap 은 넉넉히
      // — 사용자가 길게 말한 경우 잘리지 않도록.
      maxTokens: 1024,
      // 창작 여지 최소화. memory-chat 의 summarize(0.4) 보다 더 낮춤.
      temperature: 0.3,
    },
  );

  // 모델이 따옴표나 머리말을 붙이면 제거.
  let cleaned = res.text.trim();
  cleaned = cleaned.replace(/^["「『]\s*|\s*["」』]$/g, "");

  // H2 — 빈 응답이거나 원문과 사실상 동일하면 토큰 사용량을 0 으로 보고.
  // chargeOneShot 은 cost 0 일 때 차감/ledger 모두 스킵 → 사용자가 변화
  // 없이 토큰만 잃는 일이 없음. Anthropic 호출 자체 비용은 운영 측에서
  // 흡수 (드물고, 모니터링으로 추적).
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const noChange = cleaned === "" || norm(cleaned) === norm(trimmed);
  if (noChange) {
    return { cleaned: trimmed, inputTokens: 0, outputTokens: 0 };
  }

  return {
    cleaned,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}
