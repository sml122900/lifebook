// 인생 연혁 / 비서 fallback 공용 상수 — 순수 모듈(prisma 무관).
// page.tsx · AssistantWidget · 월 화면(archived) 가 각자 정의하던 중복을
// 단일 출처로 통합.
//
// LATEST_YEAR/MONTH — 비서 fallback 기준. life_event 0 개일 때 시드 마지막
// 달을 기준 시기로 삼는다(시드에 시대 사건/노래가 풍성해 빈 답 회피).
// APPROX_DEFAULT_MONTH — eventMonth 가 null(사이 이벤트)일 때 "그해 중반".
//
// (L8 후속 — new Date() 기반으로 통합 시 이 한 곳만 고치면 됨.)
export const LATEST_YEAR = 2026;
export const LATEST_MONTH = 5;
export const APPROX_DEFAULT_MONTH = 6;
