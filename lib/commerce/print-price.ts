// My Life 인쇄본 가격(2026-11-09 성민 확정 — docs/phase/print-mylife.md §15): 장당 8,000원 · 배송비 포함(무료배송) · 표지 포함 최대 20장.
// 2026-11-08 장수 구간(6·12·20장) 구조는 폐기. 순수 모듈(서버·화면 공용) — 화면 금액 줄과 서버 주문이 같은 함수(printPrice)로 계산한다.
// 주문 금액은 서버가 장수를 다시 세서 정한다(클라 금액 불신). 주문 행: unitKrw = 장당 · quantity = 장수 · shippingKrw = 0.

import { PRINT } from "../print-layout";

export const PRINT_PAGE_KRW = 8_000;
export const PRINT_SHIPPING_KRW = 0; // 배송비 포함 가격(무료배송)
// 최소 주문 = 표지 + 1장 = 2장(16,000원 — 2026-11-09 성민 확정). 표지만 있는 1장은 인쇄할 시기가 없음.
export const PRINT_MIN_PAGES = 2;

// 토스 신고 최고가(2026-11-09 성민 재신고 = 20장 × 8,000원). 최대 장수 결제액이 이 값을 넘으면 판매 안 함.
export const PRINT_MAX_TOTAL_KRW = 160_000;

export type PrintPrice = { unitKrw: number; quantity: number; shippingKrw: number; totalKrw: number };

// 장수 → 금액. 최소 장수(2) 미만·상한 초과·금액 없음이면 null(주문 잠금).
export function printPrice(pageCount: number, pageKrw: number = PRINT_PAGE_KRW): PrintPrice | null {
  if (!Number.isInteger(pageCount) || pageCount < PRINT_MIN_PAGES || pageCount > PRINT.MAX_PAGES || !(pageKrw > 0)) return null;
  return { unitKrw: pageKrw, quantity: pageCount, shippingKrw: PRINT_SHIPPING_KRW, totalKrw: pageKrw * pageCount + PRINT_SHIPPING_KRW };
}

// 판매 중 = 장당 금액이 있고, 최대 장수 결제액이 최고가 이하.
export function printOnSale(pageKrw: number = PRINT_PAGE_KRW): boolean {
  return pageKrw > 0 && pageKrw * PRINT.MAX_PAGES + PRINT_SHIPPING_KRW <= PRINT_MAX_TOTAL_KRW;
}
