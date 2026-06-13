// 실물 상품 카탈로그 — 서버가 가격의 진실 원천(클라가 보낸 금액 불신).
// TOPUP_PACKAGES(lib/tokens/policy) 와 같은 상수 패턴. 재고·관리자 편집·
// 다수 상품/옵션이 필요해지면 그때 DB Product 로 승격(추가 마이그).
//
// 가격: 경영방 확정(2026-06). 배송비 균일 SHIPPING_KRW 별도 → 주문 표시에서
// "상품 + 배송" 분리, 토스 결제는 배송비 포함 총액(totalKrw).
// v1 수량은 항상 1(UI 수량 선택 없음). 주문은 productId + 단가 스냅샷 저장.

// 배송비 — 균일. 주문 시점에 ProductOrder.shippingKrw 로 스냅샷.
export const SHIPPING_KRW = 3000;

export type ProductId = "poster" | "charm" | "book";

export type Product = {
  id: ProductId;
  // 표시명(카드·상세·주문·토스 orderName). 랜딩 S3 라벨과 정합 목표.
  // ⚠️ poster 는 경영방 대표 상품이 "인생 나무 A2" 라 S3 라벨("인생 연혁
  //    포스터")과 다름 — S3 연결 시 라벨 정합/옵션화 결정 필요(미해결).
  name: string;
  spec: string; // 규격 한 줄 (A2 / 소프트커버 등)
  blurb: string; // 한 줄 소개
  unitKrw: number;
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "poster",
    name: "인생 나무 포스터",
    spec: "A2 (420 × 594mm)",
    blurb: "한 분의 인생을 한 그루 나무로 — 벽에 거는 큰 연혁.",
    unitKrw: 49000,
  },
  {
    id: "charm",
    name: "인생 씨앗(가)",
    spec: "휴대용",
    blurb: "곁에 두고 꺼내 보는 작은 인생 기록물.",
    unitKrw: 19000,
  },
  {
    id: "book",
    name: "자서전 책",
    spec: "소프트커버",
    blurb: "이야기를 묶은, 세상에 하나뿐인 책.",
    unitKrw: 99000,
  },
] as const;

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// 서버 측 금액 계산 — 단가·배송비 스냅샷 + 총액. 클라가 보낸 금액은 절대
// 신뢰하지 않고 이 결과를 ProductOrder 에 박는다. v1 수량은 항상 1.
export function computeOrderAmount(
  product: Product,
  quantity: number,
): { unitKrw: number; shippingKrw: number; totalKrw: number } {
  const qty = Math.max(1, Math.floor(quantity));
  return {
    unitKrw: product.unitKrw,
    shippingKrw: SHIPPING_KRW,
    totalKrw: product.unitKrw * qty + SHIPPING_KRW,
  };
}
