// 주문 상태 표시·환불 정책 — 사용자/관리자 화면 공용(순수, prisma 무관).

import type { ProductOrderStatus } from "@/lib/generated/prisma/enums";

// 상태 한글 라벨(시니어 친화). enum 값 → 표시 문구.
export const ORDER_STATUS_LABEL: Record<ProductOrderStatus, string> = {
  pending: "결제 대기",
  awaiting_payment: "입금 대기",
  paid: "주문 접수",
  preparing: "제작 준비 중",
  shipped: "배송 중",
  delivered: "배송 완료",
  failed: "결제 실패",
  canceled: "취소됨",
  refunded: "환불 완료",
};

// 발주(제작) 착수 전이면 환불 가능 — 시간이 아니라 *상태* 기준.
// paid(접수)이고 아직 환불요청/처리 전일 때만.
export function isRefundable(status: ProductOrderStatus): boolean {
  return status === "paid";
}

// 환불 정책 문구(주문화면·내주문·약관 공용). PG 심사 노출용.
// 2026-11-08 초안 — 토스 요건(구매일 또는 공급 시작일부터 7일 중 늦은 날)에 맞춤. 주문 제작 예외(청약철회 제한) 문구는 넣지 않음.
// [임시 — 성민 확정 필요 · 법률 검토 필요] 2026-11-08 — 첫째·셋째 줄(7일·반품 배송비). 환불 요청 버튼(isRefundable)은 그대로 발주 전만 —
// 발주 뒤 7일 안 취소·반품은 고객센터 연락으로.
export const REFUND_POLICY_LINES = [
  "결제하신 날과 상품을 받으신 날 가운데 늦은 날부터 7일 안에는 주문을 취소하거나 반품하실 수 있어요.",
  "받으신 상품에 하자가 있거나 잘못 배송된 경우, 7일 이내에 무상으로 다시 만들어 드려요.",
  "마음이 바뀌어 반품하실 때는 반품 배송비를 고객님이, 상품 하자·잘못 배송일 때는 회사가 부담해요.",
  "환불은 취소 확인 후 3영업일 이내에 처리해 드려요. 카드 결제는 카드사 사정에 따라 취소 반영까지 3~7영업일이 더 걸릴 수 있어요.",
  "환불·교환은 고객센터(010-5539-1947)로 연락해 주세요.",
  "반품 주소: 서울특별시 강남구 일원로9길 70, 402호(일원동)",
] as const;

// 배송 소요 안내(전자상거래법 표시 사항, PG 심사 노출용). 상품 상세·주문
// 화면 공용 — 단일 출처.
export const SHIPPING_LEAD_TIME_LINE = "결제일로부터 최대 14일 이내에 배송해 드려요.";
