// Phase 8.1 — token policy constants.
//
// Everything pricing-related lives here so the policy is one edit away
// without touching call sites. The numbers below are calibrated against
// the Phase 7.6 [ai] usage log: a typical memory cycle (guided
// questions + title summary) measured at ~1,113 AI tokens with <2%
// variance across 3 representative events (광화문 연가 / 강남스타일 /
// IMF). See db/test-memory-usage.ts for the measurement.

/** AI tokens (input + output) collapsed into one service token. */
export const AI_TOKENS_PER_SERVICE_TOKEN = 2000;

/** Free tokens granted to a brand-new user. ~30 memory cycles. */
export const SIGNUP_GRANT_TOKENS = 30;

/**
 * Minimum balance required to START a memory cycle. We can't know the
 * exact cost until after Claude responds, so we keep a small buffer
 * over the measured average (1 token/cycle) — refusing at 2 means a
 * cycle that runs hotter than expected still won't take the wallet
 * negative.
 */
export const MIN_BALANCE_TO_START_CYCLE = 2;

/**
 * Top-up packages — the SERVER source of truth.
 *
 * Phase 8.5 takes the package id from the client, looks up krw + tokens
 * here, and confirms with Toss that exactly that krw was paid before
 * crediting tokens. The client-supplied amount is never trusted.
 */
export const TOPUP_PACKAGES = [
  { id: "starter", krw: 1000, tokens: 100, label: "스타터 100토큰" },
] as const;

export type TopupPackageId = (typeof TOPUP_PACKAGES)[number]["id"];

export function getPackage(id: string) {
  return TOPUP_PACKAGES.find((p) => p.id === id);
}

/**
 * Map a Claude usage report to a service-token charge. Rounded up so a
 * tiny call still costs at least 1 token, mirroring how billing reads
 * to a user ("나 방금 1토큰 썼네") even when actual usage is sub-unit.
 */
export function tokensFromUsage(
  inputTokens: number,
  outputTokens: number,
): number {
  const total = inputTokens + outputTokens;
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil(total / AI_TOKENS_PER_SERVICE_TOKEN));
}

// V4 — 비서 "답의 깊이" 가 고를 수 있는 모델 단가.
// 사용자에겐 절대 모델 이름 노출 X (라벨은 "간단히/자세히/가장 정확하게").
// 여기 단가는 Anthropic 공시가(per million tokens, USD). 단가가 바뀌면
// 이 표만 수정하면 됨.
export type ModelTier = "haiku" | "sonnet" | "opus";

export const MODEL_PRICING: Record<
  ModelTier,
  { input: number; output: number }
> = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 5, output: 25 },
};

// Haiku in 단가 기준 multiplier. in/out 비율이 보통 in 압도 (검색 답
// in≈17k, out≈360) 이므로 in 단가 비율 (1:3:5) 로 단순화. 출력 비중까지
// 정확히 가중하려면 in*P_in + out*P_out 인데, 단순성/예측가능성 우선.
// 사용자에게 미리 "약 N토큰" 표시할 때도 깔끔.
export const MODEL_MULTIPLIER: Record<ModelTier, number> = {
  haiku: 1,
  sonnet: 3,
  opus: 5,
};

// 모델별 토큰 비용. Haiku 는 기존 tokensFromUsage 결과 그대로 (현행 호환).
// Sonnet/Opus 는 multiplier 배수.
export function tokensFromUsageForModel(
  model: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  return tokensFromUsage(inputTokens, outputTokens) * MODEL_MULTIPLIER[model];
}
