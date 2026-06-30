// 인생 카테고리 공용 상수 — 순수 모듈(prisma 무관). 클라/서버 공용.
// place-types.ts 패턴: 서버 헬퍼(lib/life-events.ts)와 클라 폼(EventForm)이
// 같은 집합을 보던 중복을 단일 출처로 통합.

import type { LifeCategory } from "@/lib/generated/prisma/enums";

// 기간이 의미 있는 카테고리. UI(폼)와 헬퍼(저장 검증)가 공유.
// 학령기 5 + 군대 + 첫 직장은 "입학~졸업"·"입대~제대"·"입사~퇴사" 의 양 끝점이
// 의미 있음. BIRTH·RELATIONSHIP(결혼)·FAMILY(자녀)는 단일 시점.
export const PERIOD_CATEGORIES: ReadonlySet<LifeCategory> = new Set([
  "KINDERGARTEN",
  "ELEMENTARY",
  "MIDDLE",
  "HIGH",
  "UNIVERSITY",
  "MILITARY",
  "WORK",
]);
