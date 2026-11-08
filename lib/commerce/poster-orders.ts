// 포스터 실물 주문 생성 — ProductOrder 를 재질 옵션 단가 + 주문 시점 스냅샷으로
// 만든다. 정산(settleProductOrder)·success 화면·탈퇴 정리는 기존 ProductOrder
// 경로를 그대로 재사용한다(productId="poster"). 금액은 서버가 진실.

import { prisma } from "../db";
import { buildOrderSnapshot } from "../poster/snapshot";
import { POSTER_PAYMENT_LIVE_ENABLED } from "./poster-payment";
import {
  computeOptionOrderAmount,
  getProduct,
  getProductOption,
} from "./products";
import type {
  CreateProductOrderResult,
  PaymentMethod,
  ShippingInput,
} from "./orders";

export async function createPendingPosterOrder(
  userId: string,
  ownerName: string,
  optionId: string,
  shipping: ShippingInput,
  paymentMethod: PaymentMethod = "card",
): Promise<CreateProductOrderResult> {
  const product = getProduct("poster");
  if (!product) return { ok: false, error: "상품을 찾을 수 없어요." };
  // 강물 포스터 무통장입금 닫음(2026-11-08 — My Life 인쇄 상품으로 바꿀 때까지 실제 돈이 오가는 새 주문을 받지 않음).
  // 카드는 테스트 키라 청구 없음(POSTER_PAYMENT_LIVE_ENABLED 꺼 둠) — 상품 페이지 → 결제창까지는 심사 캡처용으로 남김.
  // [임시 — 성민 확정 필요] 2026-11-08
  if (paymentMethod === "bank_transfer") return { ok: false, error: "지금은 카드결제만 할 수 있어요." };

  const option = getProductOption(product, optionId);
  const amount = computeOptionOrderAmount(product, optionId, 1);
  if (!option || !amount) return { ok: false, error: "재질을 골라 주세요." };
  // 숨긴 옵션(hidden — 프리미엄 99,000원)은 화면에서만 빠져 있었고 서버는 받았음 → 거절(2026-11-08). [임시 — 성민 확정 필요] 2026-11-08
  if (option.hidden) return { ok: false, error: "지금은 고를 수 없는 재질이에요." };

  const recipientName = shipping.recipientName.trim();
  const recipientPhone = shipping.recipientPhone.trim();
  const postalCode = shipping.postalCode?.trim() || "";
  const address1 = shipping.address1.trim();
  if (!recipientName || !recipientPhone || !postalCode || !address1) {
    return { ok: false, error: "받는 분·연락처·우편번호·주소를 입력해 주세요." };
  }

  // 주문 시점 스냅샷 — 이후 편집과 무관하게 발주 파일 고정. 문장은 /poster/view 에서
  // 저장해 둔 것 그대로(AI 재호출 없음 → 주문 = 직전 시안). 원본이 바뀌었으면 거부.
  const built = await buildOrderSnapshot(userId, ownerName);
  if (!built.ok) {
    return {
      ok: false,
      error:
        built.reason === "empty"
          ? "먼저 포스터에 담을 이야기를 골라 주세요."
          : "포스터 내용이 바뀌었어요. 시안을 다시 확인해 주세요.",
    };
  }
  const snapshot = built.snapshot;

  const order = await prisma.productOrder.create({
    data: {
      userId,
      productId: "poster",
      optionId,
      quantity: 1,
      unitKrw: amount.unitKrw,
      shippingKrw: amount.shippingKrw,
      totalKrw: amount.totalKrw,
      recipientName,
      recipientPhone,
      postalCode,
      address1,
      address2: shipping.address2?.trim() || null,
      jibunAddress: shipping.jibunAddress?.trim() || null,
      deliveryMemo: shipping.deliveryMemo?.trim() || null,
      // 카드 = 결제창 대기. 무통장입금(입금대기 awaiting_payment)은 위에서 거절(2026-11-08) — 다시 열 때 이 줄도 되살림.
      paymentMethod,
      status: "pending",
      paymentLive: POSTER_PAYMENT_LIVE_ENABLED,
      posterSnapshot: snapshot,
    },
    select: { id: true },
  });

  return {
    ok: true,
    order: {
      orderId: order.id,
      totalKrw: amount.totalKrw,
      orderName: `${product.name} (${option.name})`,
    },
  };
}
