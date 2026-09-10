// 토스페이먼츠 PG 심사 대응 — 카드결제 "테스트 모드" 안내 배너를 심사 기간
// 동안만 숨기는 독립 플래그. POSTER_PAYMENT_LIVE_ENABLED(실결제 여부·주문
// paymentLive 감사 기록)와는 완전히 분리 — 이 플래그는 배너 렌더링에만
// 영향을 주고 결제 로직·감사 기록은 하나도 안 건드린다.
//
// ★ PG 심사 기간 한정 용도 — CLAUDE.md 미결 항목 참조. 심사 통과 후 반드시
// false 로 되돌리거나(더 이상 숨길 필요 없음) POSTER_PAYMENT_LIVE_ENABLED 를
// true 로 전환(실제로 테스트 모드가 아니게 됨)할 것.
export const HIDE_TEST_MODE_BANNER = process.env.HIDE_TEST_MODE_BANNER === "true";
