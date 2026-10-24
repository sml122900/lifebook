// 오늘의 인터뷰 — 연도 문항 답 해석. 정규식 먼저(AI 0회), 안 되면 Sonnet 1회.
//
// 확인질문 분류기(submitConfirmAnswer)를 쓰지 않는 이유: 그쪽은 "기억 안 나요"류
// 답에 SKIPPED(=해당 없음)·UNCLEAR(unclearCount·needsReview)를 쓸 수 있고 연도 전파가
// 붙어 있다. 여기서는 연도 숫자만 뽑는다(docs/phase/today-interview.md §6.1).

import { chat } from "../ai";

// 추출/분류는 Sonnet 고정 — 전역 aiModel 과 무관(기존 v3 정책).
const PARSE_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const MIN_YEAR = 1900;

// "모르겠어요", "기억이 안 나요", "가물가물" 같은 답 — AI 없이 모름 처리.
const UNKNOWN_RE = /모르|기억\s*이?\s*안|생각\s*이?\s*안|가물/;

export function isUnknownYearAnswer(text: string): boolean {
  return UNKNOWN_RE.test(text);
}

function yearRange(birthYear: number | null, now: Date): [number, number] {
  return [birthYear ?? MIN_YEAR, now.getFullYear()];
}

// "1985년", "1985", "85년도" — 범위 밖이거나 두 자리 연도가 1900/2000 어느 쪽인지
// 애매하면 null(→ AI).
export function parseYearDeterministic(text: string, birthYear: number | null, now: Date): number | null {
  const [min, max] = yearRange(birthYear, now);
  const four = text.match(/(?<!\d)(19|20)\d{2}(?!\d)/);
  if (four) {
    const y = Number(four[0]);
    return y >= min && y <= max ? y : null;
  }
  const two = text.match(/(?<!\d)(\d{2})\s*년/);
  if (two) {
    const yy = Number(two[1]);
    const ok = [1900 + yy, 2000 + yy].filter((y) => y >= min && y <= max);
    return ok.length === 1 ? ok[0] : null;
  }
  return null;
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

function buildYearParsePrompt(birthYear: number | null): string {
  const birthLine = birthYear
    ? `어르신은 ${birthYear}년생입니다. "스무 살 때", "국민학교 3학년 때"처럼 나이·학년으로 말하면 그걸로 연도를 계산하세요(예: 스무 살 → ${birthYear + 20}, 국민학교 3학년(만 9세) → ${birthYear + 9}).`
    : `어르신의 출생 연도는 모릅니다. 나이·학년 표현만으로는 연도를 계산하지 말고 null 로 두세요.`;
  return `어르신이 어떤 일이 몇 년도였는지 묻는 질문에 답했습니다. 답에서 그 일의 연도(4자리 정수)만 뽑으세요.
- "85년도였어요" → 1985, "2003년" → 2003
- ${birthLine}
- 연도를 알 수 없거나, 모른다·기억 안 난다는 답이면 null.
- 짐작해서 지어내지 마세요.

다음 JSON 형식으로만 답하세요(다른 텍스트 금지):
{"year": 1985} 또는 {"year": null}`;
}

export async function parseYearWithAi(text: string, birthYear: number | null, now: Date): Promise<number | null> {
  const [min, max] = yearRange(birthYear, now);
  try {
    const res = await chat([{ role: "user", content: text.slice(0, 500) }], {
      system: buildYearParsePrompt(birthYear),
      model: PARSE_MODEL,
      maxTokens: 100,
      temperature: 0,
    });
    const parsed = JSON.parse(stripJsonFence(res.text)) as { year?: unknown };
    const y = parsed.year;
    if (typeof y === "number" && Number.isInteger(y) && y >= min && y <= max) return y;
  } catch {
    // 파싱/호출 실패 → 못 알아들음(재질문 또는 모름 처리는 호출자).
  }
  return null;
}
