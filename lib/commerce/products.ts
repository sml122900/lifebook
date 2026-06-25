// 실물 상품 카탈로그 — 서버가 가격의 진실 원천(클라가 보낸 금액 불신).
// TOPUP_PACKAGES(lib/tokens/policy) 와 같은 상수 패턴. 재고·관리자 편집·
// 다수 상품/옵션이 필요해지면 그때 DB Product 로 승격(추가 마이그).
//
// 가격: 경영방 확정(2026-06). 배송비 균일 SHIPPING_KRW 별도 → 주문 표시에서
// "상품 + 배송" 분리, 토스 결제는 배송비 포함 총액(totalKrw).
// v1 수량은 항상 1(UI 수량 선택 없음). 주문은 productId + 단가 스냅샷 저장.

// 배송비 — 균일. 주문 시점에 ProductOrder.shippingKrw 로 스냅샷.
export const SHIPPING_KRW = 3000;

// 표시가는 모두 부가세(VAT) 포함 소비자가. 배송비 별도(주문 표시에서 분리).
export const PRICES_INCLUDE_VAT = true;

export type ProductId = "poster" | "charm" | "book";

// 재질/사양 옵션 — 같은 상품의 가격 분기(포스터 일반/프리미엄). 주문엔
// optionId 로 저장하고 단가는 옵션값을 스냅샷한다. 액자·족자·수량할인은
// 단가표 확정 후 여기에 추가(현재 자리만).
export type ProductOption = {
  id: string; // ProductOrder.optionId 에 저장
  name: string; // 표시명("일반"/"프리미엄")
  spec: string; // 재질 한 줄
  unitKrw: number;
};

export type Product = {
  id: ProductId;
  // 표시명(카드·상세·주문·토스 orderName) — 랜딩 S3 라벨과 통일.
  name: string;
  spec: string; // 규격 한 줄 (A2 / 소프트커버 등)
  blurb: string; // 한 줄 소개
  unitKrw: number; // 기본 단가(옵션 없는 상품 + 옵션 상품의 최저가 표시 기준)
  image: string; // /public 기준 경로 — 상품별 고유 이미지(반복 금지)
  imageAlt: string;
  options?: readonly ProductOption[]; // 있으면 주문 시 optionId 필수
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "poster",
    name: "인생 연혁 포스터",
    spec: "A2 (420 × 594mm) · 재질 선택",
    blurb: "한 분의 인생을 한 장에 담은 A2 포스터 — 벽에 거는 큰 연혁.",
    unitKrw: 39000, // 기본 = 일반(최저가)
    image: "/landing/product-poster.png",
    imageAlt: "액자에 든 인생 연혁 포스터 실물",
    // 재질 2종(경영방 확정). 액자·족자는 단가 확정 후 추가.
    options: [
      { id: "standard", name: "일반", spec: "스노우지 무광 300g", unitKrw: 39000 },
      { id: "premium", name: "프리미엄", spec: "지클레 매트 아카이벌", unitKrw: 99000 },
    ],
  },
  {
    id: "charm",
    name: "인생 씨앗(가)",
    spec: "휴대용",
    blurb: "곁에 두고 꺼내 보는 작은 인생 기록물.",
    unitKrw: 19000,
    image: "/landing/product-keepsake.png",
    imageAlt: "손에 쥐는 인생 씨앗 기념물",
  },
  {
    id: "book",
    name: "자서전 책",
    spec: "소프트커버",
    blurb: "이야기를 묶은, 세상에 하나뿐인 책.",
    unitKrw: 99000,
    image: "/landing/product-book.png",
    imageAlt: "소프트커버 자서전 책",
  },
] as const;

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// 옵션 상품의 특정 옵션 조회(없으면 undefined). 주문 단가의 진실 원천.
export function getProductOption(
  product: Product,
  optionId: string | null | undefined,
): ProductOption | undefined {
  if (!product.options || !optionId) return undefined;
  return product.options.find((o) => o.id === optionId);
}

// 옵션 단가 기준 금액 계산(포스터). 옵션이 없거나 잘못된 optionId 면 null.
export function computeOptionOrderAmount(
  product: Product,
  optionId: string,
  quantity: number,
): { unitKrw: number; shippingKrw: number; totalKrw: number } | null {
  const opt = getProductOption(product, optionId);
  if (!opt) return null;
  const qty = Math.max(1, Math.floor(quantity));
  return {
    unitKrw: opt.unitKrw,
    shippingKrw: SHIPPING_KRW,
    totalKrw: opt.unitKrw * qty + SHIPPING_KRW,
  };
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
