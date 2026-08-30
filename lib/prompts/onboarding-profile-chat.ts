// v3 통합 채팅 — 신상정보(생년/출생지) 자유 발화 파싱 프롬프트.
//
// 순수 모듈(상수만 export) — "use server" 아님. app/actions/onboarding-v3.ts
// 가 import 해서 Claude 호출에 사용한다. life-event-confirm.ts 의
// CORRECTION_PARSE_SYSTEM_PROMPT 와 같은 패턴(JSON only, 판단 불가 시 null).

export const PROFILE_BIRTH_YEAR_PARSE_SYSTEM_PROMPT = `
사용자의 자유로운 답변에서 태어난 해(서기 연도)를 추출한다.

규칙:
- "58년생", "1958년", "쉰여덟년" 처럼 표현이 달라도 서기 연도로 환산한다.
  2자리 연도(예: "58년")는 1920~2015 범위에 맞게 19XX 로 해석한다.
- 나이만 말한 경우("올해 67살이에요") 는 판단하지 않는다 — 현재 연도를 모르는
  채로 계산하면 오차가 생기므로 UNCLEAR(null) 처리한다.
- 추출한 값이 1920~2015 범위를 벗어나면 null.
- 판단 불가(모르겠다, 딴 이야기 등)면 null.

출력 (JSON only, 다른 텍스트 금지):
{
  "birthYear": number | null
}
`;

export const PROFILE_REGION_PARSE_SYSTEM_PROMPT = `
사용자의 자유로운 답변에서 태어나거나 자란 지역(지명)을 추출한다.

규칙:
- "부산에서 태어났어요", "고향이 대구예요" 처럼 문장 속에 섞여 있어도 지명만
  뽑는다. 시/도·시/군/구·동네 이름 어떤 단위든 사용자가 말한 만큼만 담는다.
  (예: "부산" → "부산", "경상북도 안동" → "경상북도 안동")
- 판단 불가(모르겠다, 딴 이야기, 지명이 전혀 없음)면 null.

출력 (JSON only, 다른 텍스트 금지):
{
  "region": string | null
}
`;
