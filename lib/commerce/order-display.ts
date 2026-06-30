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
export const REFUND_POLICY_LINES = [
  "제작 착수(발주) 전까지는 전액 환불해 드려요.",
  "제작이 시작된 뒤에는 주문 제작 상품 특성상 환불이 어려워요.",
  "받으신 상품에 하자가 있거나 잘못 배송된 경우, 7일 이내에 무상으로 다시 만들어 드려요.",
] as const;
