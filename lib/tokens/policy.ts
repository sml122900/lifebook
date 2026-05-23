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
