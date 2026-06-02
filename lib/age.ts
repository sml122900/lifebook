// Phase L2(+) — 나이 계산·표시 헬퍼.
//
// 어르신이 *연도* 는 못 떠올려도 *나이* 는 안다는 인사이트.
// "당신이 13세였을 때가 ○○년이에요" 같은 역계산 도움.
//
// 정확도 한계: BIRTH 카테고리에서 일까지는 받지 않으므로(입력 부담),
// "생일이 이미 지났다고 가정" 한 만 나이를 보여준다. ±1 오차 가능 →
// 톤은 항상 "이쯤이에요" 같이 부드럽게.
//
// BIRTH 가 없으면(연도 모름) 모든 헬퍼가 null 을 반환 — 호출부는 그 경우
// 조용히 표시 생략. 에러 X.

export type AgePair = {
  manAge: number; // 만 나이 (서양식)
  koreanAge: number; // 한국 나이 (전통식)
};

// targetYear 의 사용자 나이. birthYear 보다 targetYear 가 앞이면 null
// (음수 나이는 보여주지 않는다 — 출생 전).
//
// 생일 지났다고 가정: 만 나이 = targetYear - birthYear.
// 한국 나이 = targetYear - birthYear + 1 (전통식, 태어난 해를 1세).
export function calcAge(
  birthYear: number,
  targetYear: number,
): AgePair | null {
  if (!Number.isInteger(birthYear) || !Number.isInteger(targetYear)) {
    return null;
  }
  if (targetYear < birthYear) return null;
  const manAge = targetYear - birthYear;
  const koreanAge = manAge + 1;
  return { manAge, koreanAge };
}

// "만 13세 (한국 14세)" — 둘 다 표시. 한국 노년 사용자가 둘 다에 익숙.
export function formatAge(age: AgePair): string {
  return `만 ${age.manAge}세 (한국 ${age.koreanAge}세)`;
}

// SCHOOL 힌트용 — 사용자의 birthYear 로부터 학령기 연도 범위 역계산.
// "1965년생이시면 초등학교 1972~1978년쯤, 중학교 1978~1981년쯤,
//  고등학교 1981~1984년쯤이에요."
//
// 한국 학제 기준 (만 나이):
//   초등 : 만 7세 입학  ~ 만 12세 졸업 (6년)
//   중학 : 만 13세 입학 ~ 만 15세 졸업 (3년)
//   고교 : 만 16세 입학 ~ 만 18세 졸업 (3년)
//
// 어디까지나 *역계산 도움* — 사용자가 실제 시기와 다르면 본인 기억대로 적음.
export type SchoolYearRange = {
  label: string; // "초등학교", "중학교", "고등학교"
  startYear: number;
  endYear: number;
};

export function calcSchoolYears(birthYear: number): SchoolYearRange[] {
  if (!Number.isInteger(birthYear) || birthYear < 1900) return [];
  return [
    { label: "초등학교", startYear: birthYear + 7, endYear: birthYear + 12 },
    { label: "중학교", startYear: birthYear + 13, endYear: birthYear + 15 },
    { label: "고등학교", startYear: birthYear + 16, endYear: birthYear + 18 },
  ];
}

// v3.1 — 학령별 단일 안내 (KINDERGARTEN/ELEMENTARY/MIDDLE/HIGH/UNIVERSITY).
// 각 카테고리 폼에서 "1965년생이시면 OO은 19YY~19ZZ년쯤이에요" 안내용.
// 매핑 없는 카테고리는 null — 호출부는 그 경우 안내 생략.
import type { LifeCategory } from "./generated/prisma/enums";

const SCHOOL_AGE_RANGES: Partial<
  Record<LifeCategory, { label: string; startAge: number; endAge: number }>
> = {
  KINDERGARTEN: { label: "어린이집·유치원", startAge: 4, endAge: 6 },
  ELEMENTARY: { label: "초등학교", startAge: 7, endAge: 12 },
  MIDDLE: { label: "중학교", startAge: 13, endAge: 15 },
  HIGH: { label: "고등학교", startAge: 16, endAge: 18 },
  UNIVERSITY: { label: "대학교", startAge: 19, endAge: 22 },
};

export function schoolYearsForCategory(
  category: LifeCategory,
  birthYear: number,
): SchoolYearRange | null {
  const range = SCHOOL_AGE_RANGES[category];
  if (!range) return null;
  if (!Number.isInteger(birthYear) || birthYear < 1900) return null;
  return {
    label: range.label,
    startYear: birthYear + range.startAge,
    endYear: birthYear + range.endAge,
  };
}
