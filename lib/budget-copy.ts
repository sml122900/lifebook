// AI 사용 한도 공통 거절 문구(2026-11-08 — 한도 일원화). lib/ai withUsageLedger 가 한도에 걸리면 BudgetBlockedError(reason) —
// 진입점이 이 문구를 보여 준다. 이야기 나누기·지도 AI·오늘의 인터뷰는 자기 문구를 그대로 쓴다(lib/free-chat-copy · my-life-copy ask.errors · interview/copy).
// 순수 모듈(클라이언트에서도 import).

export type BudgetReason = "daily" | "test";

export const BUDGET_COPY: Record<BudgetReason, string> = {
  daily: "오늘은 AI 기능이 잠시 쉬어요. 내일 다시 해 주세요.",
  test: "테스트 계정의 오늘 AI 사용 한도를 다 써서 쉬어요. 내일 다시 해 주세요.",
};

export const budgetMessage = (r: BudgetReason): string => BUDGET_COPY[r];
