// 오늘의 인터뷰 — 질문 풀 문구 자리표시 치환(순수). question-pool.ts 는 데이터만 두고
// 렌더는 여기서 한다.
//
//   {elemSchool}        → 출생연도 기준 학제 명칭(국민학교/초등학교 — getElemSchoolLabel,
//                          입학 = 출생연도 + 7, 골격 생성과 같은 기준). 출생연도 없으면 "초등학교".
//   {elemSchool:은/는}  → 명칭 + 받침에 맞는 조사(lib/josa withJosa). 조사 쌍은 JosaPair 만.
//   {who}·{who:과/와}   → "관계별 나" 문항의 관계 대상 이름(인물·그룹 이름 또는 범주 label).
//                          who 를 안 넘기면 자리표시를 그대로 둔다.

import { getElemSchoolLabel } from "../constants/education-labels";
import { withJosa } from "../josa";

type JosaPair = Parameters<typeof withJosa>[1];
const JOSA_PAIRS: JosaPair[] = ["을/를", "과/와", "이/가", "은/는", "으로/로", "아/야", "이랑/랑"];

export function elemSchoolName(birthYear: number | null): string {
  return birthYear === null ? "초등학교" : getElemSchoolLabel(birthYear + 7);
}

export function renderPoolText(text: string, birthYear: number | null, who?: string): string {
  const names: Record<string, string | undefined> = { elemSchool: elemSchoolName(birthYear), who };
  return text.replace(/\{(elemSchool|who)(?::([^}]+))?\}/g, (whole, key: string, pair?: string) => {
    const name = names[key];
    if (name === undefined) return whole;
    if (pair === undefined) return name;
    return JOSA_PAIRS.includes(pair as JosaPair) ? name + withJosa(name, pair as JosaPair) : whole;
  });
}
