// v3 P6 — 인물 모드. "그 시절 주변 사람" 질문에 대한 자유 답변에서 인물
// 후보를 추출하는 프롬프트.
//
// 순수 모듈(상수만 export) — "use server" 아님. app/actions/person-chat.ts
// 가 import 해서 Claude 호출에 사용한다. onboarding-chat/actions.ts 의
// extractOnboardingPeople 프롬프트와 같은 스타일(JSON only, 인물 없으면 []).
// 그쪽은 v2 온보딩 여러 답변(형제자매·부모님·친한친구)을 한 번에 훑지만,
// 여기는 한 턴짜리 단일 답변만 본다는 게 다르다.

export const PERSON_EXTRACT_SYSTEM_PROMPT = `유효한 JSON 배열만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.`;

export function buildPersonExtractUserMessage(question: string, answer: string): string {
  return `어르신께 "${question}" 라고 여쭤봤고, 아래처럼 답하셨습니다. 답변에서 언급된
실제 인물을 추출하세요.

포함: 이름이나 호칭으로 특정된 사람이면 관계 종류와 무관하게 전부 — 친구·동료·
이웃뿐 아니라 선생님·담임·은사·교수, 선임·상사·사장·선배, 가족·친척, 이웃 어른
등. 질문이 "친하게 지낸 사람"을 물었더라도 답변에 나온 사람은 반드시 포함하세요
(예: "박정호 선생님이 담임이셨어요" → [{"name":"박정호","relation":"담임 선생님"}]).
제외: "없어요"/"기억 안 나요"/"글쎄요" 처럼 인물을 언급하지 않은 답변, 역사
인물, 연예인, 특정 인물이 아닌 집단 언급("친구들 많았죠" 처럼 개인 특정 안 됨).
이름이 언급됐으면 name 에 넣고, 성이나 이름 일부만 나와도 그대로 사용. 이름이
없고 호칭만 있으면("단짝 친구가 있었어요") name 은 null.
관계(relation)는 답변에 쓰인 표현을 그대로("친구", "짝꿍", "동기", "담임 선생님",
"선임" 등), 없으면 "지인".
중복 없이 최대 3명.

반드시 유효한 JSON 배열만 출력: [{"name":"이름 또는 null","relation":"관계"}]
인물 없으면: []

---답변---
${answer.slice(0, 500)}
---끝---`;
}
