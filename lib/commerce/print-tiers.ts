// My Life 인쇄본 가격 구간(2026-11-08 — docs/phase/print-mylife.md Q4 B 장수 구간 정액 · Q5 상한 20장).
// 구조만 정함 — 금액은 인쇄 원가 견적 뒤 성민이 unitKrw 에 넣는다. 금액이 하나라도 비면 상품은 공개 안 됨(printOnSale).
// 순수 모듈(서버·화면 공용). 주문 금액은 서버가 장수를 다시 세서 이 표로 정한다(클라 금액 불신).

export type PrintTier = {
  id: string; // ProductOrder.optionId
  name: string; // [임시 — 성민 확정 필요] 2026-11-08
  maxPages: number;
  unitKrw: number | null; // null = 아직 안 정함
};

export const PRINT_TIERS: readonly PrintTier[] = [
  { id: "upto6", name: "6장까지", maxPages: 6, unitKrw: null },
  { id: "upto12", name: "12장까지", maxPages: 12, unitKrw: null },
  { id: "upto20", name: "20장까지", maxPages: 20, unitKrw: null },
];

// 토스 신고 최고가(§5.3) — 배송비를 더한 결제 금액이 이 값을 넘는 구간이 있으면 판매 안 함.
export const PRINT_MAX_TOTAL_KRW = 50_000;

// 장수에 맞는 구간. 마지막 구간을 넘으면 null(주문 잠금).
export function tierFor(pageCount: number, tiers: readonly PrintTier[] = PRINT_TIERS): PrintTier | null {
  return tiers.find((t) => pageCount <= t.maxPages) ?? null;
}

// 판매 중 = 모든 구간에 금액이 있고, 구간 금액 + 배송비가 최고가 이하.
export function printOnSale(shippingKrw: number, tiers: readonly PrintTier[] = PRINT_TIERS): boolean {
  return tiers.length > 0 && tiers.every((t) => t.unitKrw != null && t.unitKrw > 0 && t.unitKrw + shippingKrw <= PRINT_MAX_TOTAL_KRW);
}
