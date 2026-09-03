// v3 P10-4 — 인물 호칭. relation(자유 텍스트, "초등 친구"/"담임 선생님"/
// "외할머니" 등)이나 name 자체(추출 시 이름을 못 얻어 relation 을 name
// 자리에 대신 쓴 경우 — lib/person-chat.ts submitPersonAnswer 참고)에
// 윗사람 호칭이 있으면, 대화·저장 문구에서 이름만 반말 조사로 부르는 대신
// 호칭을 살려 격식 조사("과/와")를 쓴다. 자유 입력이라 완벽한 판정은
// 불가능 — 못 찾으면 기존처럼 이름만 캐주얼하게 부르는 안전한 쪽으로
// 떨어진다.
//
// P11-2 — 가족·은사 외에 사회적 윗사람(선임·상사·사장·선배·교수·성직자·
// 의사 등)까지 확장. 목록에 없어도 "~님"으로 끝나는 호칭 토큰("목사님",
// "사모님")은 그 자체를 호칭으로 쓴다. Sonnet 추출 시 "존칭 필요" 플래그를
// 함께 뽑는 방식도 검토했으나 Person 에 저장할 컬럼이 없어(스키마 변경
// 필요) 재진입·갭 카드에서 플래그가 유실된다 — relation 텍스트만으로
// 판정하는 현재 방식을 유지하고 어휘만 넓힌다.

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
  "선생",
  "은사",
  "스승",
  "교수",
  "담임",
  "사장",
  "부장",
  "과장",
  "팀장",
  "선배",
  "선임",
  "상사",
  "상관",
  "고참",
  "사수",
  "소대장",
  "중대장",
  "반장",
  "원장",
  "의사",
  "스님",
  "목사",
  "신부",
  "사모",
  "어르신",
  "형님",
  "누님",
];

// 목록에 없어도 "~님"으로 끝나는 토큰은 호칭으로 본다("사장님"·"목사님"
// 처럼 목록 어휘의 님-형도 이 규칙으로 함께 잡힌다).
function findHonorificSuffixToken(text: string): string | null {
  return text.split(/\s+/).find((t) => t.length >= 2 && t.endsWith("님")) ?? null;
}

function findHonorificTerm(text: string | null): string | null {
  if (!text) return null;
  return findHonorificSuffixToken(text) ?? HONORIFIC_TERMS.find((t) => text.includes(t)) ?? null;
}

// 이름 + 조사까지 완성된 형태로 반환("김순덕 할머니와" / "박정호 선생님과" /
// "철수랑" 처럼). 호출부는 뒤에 문장만 이어 붙이면 된다.
export function buildPersonAddress(name: string, relation: string | null): string {
  const term = findHonorificTerm(name) ?? findHonorificTerm(relation);
  if (!term) return `${name}${withJosa(name, "이랑/랑")}`;
  const addressed = name.includes(term) ? name : `${name} ${term}`;
  return `${addressed}${withJosa(addressed, "과/와")}`;
}
