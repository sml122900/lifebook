// 실물 상품 카탈로그 — 서버가 가격의 진실 원천(클라가 보낸 금액 불신).
// TOPUP_PACKAGES(lib/tokens/policy) 와 같은 상수 패턴. 재고·관리자 편집·
// 다수 상품/옵션이 필요해지면 그때 DB Product 로 승격(추가 마이그).
//
// 가격: 경영방 확정(2026-06). 배송비 균일 SHIPPING_KRW 별도 → 주문 표시에서
// "상품 + 배송" 분리, 토스 결제는 배송비 포함 총액(totalKrw).
// v1 수량은 항상 1(UI 수량 선택 없음). 주문은 productId + 단가 스냅샷 저장.

import { PRINT_PAGE_KRW, PRINT_SHIPPING_KRW, printOnSale } from "./print-price";

// 배송비 — 균일. 주문 시점에 ProductOrder.shippingKrw 로 스냅샷.
export const SHIPPING_KRW = 3000;

// 표시가는 모두 부가세(VAT) 포함 소비자가. 배송비 별도(주문 표시에서 분리).

export type ProductId = "poster" | "charm" | "book" | "mylife-print";

// 재질/사양 옵션 — 같은 상품의 가격 분기(포스터 일반/프리미엄). 주문엔
// optionId 로 저장하고 단가는 옵션값을 스냅샷한다. 액자·족자·수량할인은
// 단가표 확정 후 여기에 추가(현재 자리만).
export type ProductOption = {
  id: string; // ProductOrder.optionId 에 저장
  name: string; // 표시명("일반"/"프리미엄")
  spec: string; // 재질 한 줄
  unitKrw: number;
  // PG 심사 대응(2026-09-12) — true 면 주문 화면 선택 UI에서 숨김(orderable
  // 패턴과 동일). 정의는 유지 — 데이터/주문 로직 무수정, 표시만 제외.
  hidden?: boolean;
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
  // 금액 앞말(2026-11-09 — My Life 인쇄본 "장당"). 있으면 목록·상세가 "장당 8,000원"처럼 보임.
  pricePrefix?: string;
  // 이 상품의 배송비(없으면 SHIPPING_KRW). 2026-11-09 — My Life 인쇄본은 배송비 포함 가격(0).
  shippingKrw?: number;
  // PG 심사 대응(2026-09-11) — /shop 목록에 노출할지. 기본 true(생략 시
  // 노출). false 는 실제 제작·배송 파이프라인이 아직 없는 상품(현재
  // charm·book)을 목록에서만 숨긴다 — 상세 URL(/shop/<id>)과 주문 로직은
  // 무수정, getProduct 로는 그대로 조회된다.
  orderable?: boolean;
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "poster",
    name: "인생 연혁 포스터",
    spec: "A2 (420 × 594mm)",
    blurb: "한 분의 인생을 한 장에 담은 A2 포스터 — 벽에 거는 큰 연혁.",
    // 2026-09-10 — PG 심사 대응(토스페이먼츠). 배송비(SHIPPING_KRW=3000) 포함
    // 총액이 12,000원이 되도록 상품가만 9,000원으로. "일반" 옵션도 동일하게
    // 맞춤(기본값 = 일반 최저가 원칙 유지) — "프리미엄"은 무수정.
    unitKrw: 9000, // 기본 = 일반(최저가). 배송비 3,000원 포함 총 12,000원.
    // 2026-09-12 — PG 심사 대응. 기존 이미지(product-poster.png)는 느티나무
    // 템플릿(준비 중, 미주문 가능)이라 실제로 주문 가능한 유일한 템플릿인
    // 강물 샘플(sample-poster.webp)로 교체.
    image: "/sample-poster.webp",
    imageAlt: "인생 강물 템플릿으로 만든 인생 연혁 포스터 실물",
    // 재질 2종(경영방 확정). 액자·족자는 단가 확정 후 추가.
    options: [
      { id: "standard", name: "일반", spec: "스노우지 무광 300g", unitKrw: 9000 },
      // PG 심사 대응(2026-09-12) — 심사 기간 한정 숨김. 정의는 보존.
      { id: "premium", name: "프리미엄", spec: "지클레 매트 아카이벌", unitKrw: 99000, hidden: true },
    ],
    // 2026-11-08 판매 종료(My Life 인쇄본으로 교체 — docs/phase/print-mylife.md §9). 정의는 보존 주문 2건의 이름·옵션 표시에만 남김 —
    // 목록·상세·주문 모두 없음(그리기 코드 삭제, 보존 주문 그림 = lib/commerce/kept-poster).
    orderable: false,
  },
  {
    id: "charm",
    name: "인생 씨앗(가)",
    spec: "휴대용",
    blurb: "곁에 두고 꺼내 보는 작은 인생 기록물.",
    unitKrw: 19000,
    image: "/landing/product-keepsake.png",
    imageAlt: "손에 쥐는 인생 씨앗 기념물",
    // 2026-09-11 — PG 심사 대응. 실제 제작·배송 파이프라인 아직 없음(이름도
    // "(가)"=가칭) — 목록에서만 숨김, 상세/주문 로직은 무수정.
    orderable: false,
  },
  {
    id: "book",
    name: "자서전 책",
    spec: "소프트커버",
    blurb: "이야기를 묶은, 세상에 하나뿐인 책.",
    unitKrw: 99000,
    image: "/landing/product-book.png",
    imageAlt: "소프트커버 자서전 책",
    // 2026-09-11 — PG 심사 대응. charm 과 같은 이유(제작·배송 파이프라인 없음).
    orderable: false,
  },
  {
    // My Life 인쇄본(2026-11-08 — docs/phase/print-mylife.md). 가격 = 장당 8,000원 × 장수, 배송비 포함(2026-11-09 성민 — lib/commerce/print-price).
    // 금액이 없으면 비공개(목록·상세·주문 모두 없음). 주문은 /my-life/print(출력 편집 → 결제위젯 v2).
    id: "mylife-print",
    name: "My Life 인쇄본", // [임시 — 성민 확정 필요] 2026-11-08
    spec: "A4 세로 · 표지 포함 최대 20장 · 배송비 포함", // [임시 — 성민 확정 필요] 2026-11-09
    blurb: "내 My Life 지도를 시기별로 한 장씩 담은 인쇄본 — 가족과 한 장씩 넘기며 이야기해요.", // [임시 — 성민 확정 필요] 2026-11-08
    unitKrw: PRINT_PAGE_KRW, // 장당 — 주문 금액은 장수를 곱해 서버가 계산(print-orders)
    pricePrefix: "장당", // [임시 — 성민 확정 필요] 2026-11-09
    shippingKrw: PRINT_SHIPPING_KRW,
    image: "/landing/print-cover.webp", // 견본 = 렌더 그림(가상 인물 — 랜딩과 같음). 시험 인쇄 사진(Q19)이 나오면 교체
    imageAlt: "My Life 인쇄본 표지와 차례 견본",
    orderable: printOnSale(),
  },
] as const;

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function shippingKrwOf(product: Product): number {
  return product.shippingKrw ?? SHIPPING_KRW;
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
