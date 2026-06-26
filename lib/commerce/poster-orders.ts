// 포스터 실물 주문 생성 — ProductOrder 를 재질 옵션 단가 + 주문 시점 스냅샷으로
// 만든다. 정산(settleProductOrder)·success 화면·탈퇴 정리는 기존 ProductOrder
// 경로를 그대로 재사용한다(productId="poster"). 금액은 서버가 진실.

import { prisma } from "../db";
import { buildPosterSnapshot } from "../poster/snapshot";
import { POSTER_PAYMENT_LIVE_ENABLED } from "./poster-payment";
import {
  computeOptionOrderAmount,
  getProduct,
  getProductOption,
} from "./products";
import type { CreateProductOrderResult, ShippingInput } from "./orders";

export async function createPendingPosterOrder(
  userId: string,
  ownerName: string,
  optionId: string,
  shipping: ShippingInput,
): Promise<CreateProductOrderResult> {
  const product = getProduct("poster");
  if (!product) return { ok: false, error: "상품을 찾을 수 없어요." };

  const option = getProductOption(product, optionId);
  const amount = computeOptionOrderAmount(product, optionId, 1);
  if (!option || !amount) return { ok: false, error: "재질을 골라 주세요." };

  const recipientName = shipping.recipientName.trim();
  const recipientPhone = shipping.recipientPhone.trim();
  const postalCode = shipping.postalCode?.trim() || "";
  const address1 = shipping.address1.trim();
  if (!recipientName || !recipientPhone || !postalCode || !address1) {
    return { ok: false, error: "받는 분·연락처·우편번호·주소를 입력해 주세요." };
  }

  // 주문 시점 스냅샷 — 이후 편집과 무관하게 발주 파일 고정.
  const snapshot = await buildPosterSnapshot(userId, ownerName);
  if (!snapshot) {
    return { ok: false, error: "먼저 포스터에 담을 이야기를 골라 주세요." };
  }

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
