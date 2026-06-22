// 통녹음 STT 과금 정책.
//
// 비용 계산은 CLOVA 청구 기준(15초 단위 올림 → 분 환산)으로, 단가는 경영방 확정.
// STT_TOKEN_CHARGING_ENABLED=false(기본) 이면 전원 무료 — 과금 코드가 있어도
// 실제 차감은 일어나지 않는다.
//
// 단가 조정이 필요할 때는 STT_PER_MIN_TOKENS 하나만 바꾸면 됨.

/** 녹음 1분당 차감 서비스 토큰 (경영방 확정 단가 = 5). */
export const STT_PER_MIN_TOKENS = 5;

/** CLOVA 청구 최소 단위 (초). */
const BILLING_UNIT_SEC = 15;

/** 최대 녹음 시간 (초). 초과 시 FreeRecorder 자동 정지. */
export const STT_MAX_DURATION_SEC = 90 * 60; // 90분

/**
 * 실제 녹음 초 → 서비스 토큰 계산.
 * 15초 단위 올림 → 분 환산 → 분당 5토큰 → 정수 올림.
 *
 * 검증: 60 → 5 / 3600 → 300 / 5400 → 450
 */
export function calcSttTokens(durationSec: number): number {
  if (durationSec <= 0) return 0;
  const billedSec = Math.ceil(durationSec / BILLING_UNIT_SEC) * BILLING_UNIT_SEC;
  return Math.ceil((billedSec / 60) * STT_PER_MIN_TOKENS);
}

/**
 * 통녹음 STT 과금 활성화 여부. 기본 false (프로토타입 모드 = 전원 무료).
 * 운영 전환 시 환경변수 STT_TOKEN_CHARGING_ENABLED=true 로 설정.
 * per-user 예외(예: 외할머니 영구 무료)는 전역 전환 후 별도 플래그로 추가 예정.
 */
export const STT_TOKEN_CHARGING_ENABLED =
  process.env.STT_TOKEN_CHARGING_ENABLED === "true";
