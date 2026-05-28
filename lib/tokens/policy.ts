// Phase 8.1 — 토큰 정책 상수.
//
// 가격 관련은 전부 여기 모아, 호출부를 건드리지 않고 정책 한 곳만 고치면
// 되게 한다. 아래 숫자들은 Phase 7.6 [ai] 사용 로그로 calibrate: 대표
// 사건 3개(광화문 연가 / 강남스타일 / IMF)에서 전형적인 추억 사이클(가이드
// 질문 + 제목 요약)이 ~1,113 AI 토큰, 편차 <2% 로 측정됨.
// 측정은 db/test-memory-usage.ts 참조.

/** AI 토큰(입력+출력)을 서비스 토큰 1개로 환산하는 기준. */
export const AI_TOKENS_PER_SERVICE_TOKEN = 2000;

/** 신규 사용자에게 무료로 주는 토큰. 약 30회 추억 사이클 분량. */
export const SIGNUP_GRANT_TOKENS = 30;

/**
 * 추억 사이클을 "시작"하는 데 필요한 최소 잔액. Claude 응답 전엔 정확한
 * 비용을 알 수 없으니 측정 평균(1토큰/사이클)보다 약간 버퍼를 둔다 —
 * 2 에서 거절하면 예상보다 비싸게 돈 사이클도 잔액을 음수로 안 만든다.
 */
export const MIN_BALANCE_TO_START_CYCLE = 2;

/**
 * 충전 패키지 — 서버가 진실의 원천.
 *
 * Phase 8.5 는 클라가 보낸 패키지 id 로 여기서 krw+tokens 를 조회하고,
 * 토큰을 적립하기 전에 정확히 그 krw 가 결제됐는지 토스로 확인한다.
 * 클라가 보낸 금액은 절대 신뢰하지 않는다.
 */
export const TOPUP_PACKAGES = [
  { id: "starter", krw: 1000, tokens: 100, label: "스타터 100토큰" },
] as const;

export type TopupPackageId = (typeof TOPUP_PACKAGES)[number]["id"];

// 패키지 id 로 정의를 찾는다(없으면 undefined).
export function getPackage(id: string) {
  return TOPUP_PACKAGES.find((p) => p.id === id);
}

/**
 * Claude 사용량 보고를 서비스 토큰 차감으로 환산. 올림(ceil)이라 아주
 * 작은 호출도 최소 1토큰 — 실제 사용량이 1토큰 미만이어도 사용자에겐
 * "나 방금 1토큰 썼네"로 읽히도록 청구를 맞춘다.
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
