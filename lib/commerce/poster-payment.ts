// 포스터 실물결제 라이브 플래그 — STT_TOKEN_CHARGING_ENABLED 패턴.
//
// false(기본): 테스트모드 — 주문·결제 플로우는 다 돌되 Toss 테스트키로 실청구
//   없음. 주문에 paymentLive=false 기록 + "테스트 결제" 배너.
// true: 라이브 — 실제 청구. ★ ON 조건 = 통신판매업 신고번호 + Toss 프로덕션
//   승인 둘 다 충족 후 이 환경변수만 "true" 로. (Toss 라이브 키 교체 동반.)
export const POSTER_PAYMENT_LIVE_ENABLED =
  process.env.POSTER_PAYMENT_LIVE_ENABLED === "true";
