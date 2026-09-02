// v3 P10-4 — 인물 호칭. relation(자유 텍스트, "초등 친구"/"담임 선생님"/
// "외할머니" 등)이나 name 자체(추출 시 이름을 못 얻어 relation 을 name
// 자리에 대신 쓴 경우 — lib/person-chat.ts submitPersonAnswer 참고)에
// 윗사람 호칭이 있으면, 대화·저장 문구에서 이름만 반말 조사로 부르는 대신
// 호칭을 살려 격식 조사("과/와")를 쓴다. 자유 입력이라 완벽한 판정은
// 불가능 — 못 찾으면 기존처럼 이름만 캐주얼하게 부르는 안전한 쪽으로
// 떨어진다.

import { withJosa } from "./josa";

const HONORIFIC_TERMS = [
  "할머니",
  "할아버지",
  "외할머니",
  "외할아버지",
  "친할머니",
  "친할아버지",
  "어머니",
  "아버지",
  "엄마",
  "아빠",
  "이모",
  "고모",
  "삼촌",
  "외삼촌",
  "큰아버지",
  "큰어머니",
  "작은아버지",
  "작은어머니",
  "선생님",
  "은사님",
  "스승님",
  "교수님",
  "담임",
  "사장님",
  "선배님",
];

function findHonorificTerm(text: string | null): string | null {
  if (!text) return null;
  return HONORIFIC_TERMS.find((t) => text.includes(t)) ?? null;
}

// 이름 + 조사까지 완성된 형태로 반환("김순덕 할머니와" / "박정호 선생님과" /
// "철수랑" 처럼). 호출부는 뒤에 문장만 이어 붙이면 된다.
export function buildPersonAddress(name: string, relation: string | null): string {
  const term = findHonorificTerm(name) ?? findHonorificTerm(relation);
  if (!term) return `${name}${withJosa(name, "이랑/랑")}`;
  const addressed = name.includes(term) ? name : `${name} ${term}`;
  return `${addressed}${withJosa(addressed, "과/와")}`;
}
