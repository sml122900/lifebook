// 실물 상품 주문(ProductOrder) 생명주기 — lib/tokens/orders 의 토큰 주문
// 패턴을 복제하되, settle 부수효과가 "잔액 적립"이 아니라 "배송지 + paid
// 상태 기록"이다. 금액은 서버가 진실(클라가 보낸 금액 불신), 정산은
// paymentKey @unique 로 idempotent. 토스 confirm 은 lib/tokens/toss 공용 재사용.

import { prisma } from "../db";
import { orderFulfiller, type FulfillableOrder } from "./fulfillment";
import { computeOrderAmount, getProduct } from "./products";

// 결제수단 — "card"(토스 카드, 테스트모드) | "bank_transfer"(무통장입금, 실작동).
export type PaymentMethod = "card" | "bank_transfer";

export type ShippingInput = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string | null; // 입력 필수(아래 검증) — 타입은 호환 위해 nullable
  address1: string; // 도로명 주소
  address2: string | null; // 상세 주소(동·호)
  jibunAddress: string | null; // 지번 주소(카카오 우편번호 제공)
  deliveryMemo: string | null;
};

export type CreatedProductOrder = {
  orderId: string;
  totalKrw: number;
  orderName: string;
};

export type CreateProductOrderResult =
  | { ok: true; order: CreatedProductOrder }
  | { ok: false; error: string };

// packageId 대신 productId. 단가·배송비·총액은 서버가 상수에서 스냅샷한다.
// 배송지는 주문 시점 스냅샷(User 에 구조화 주소 없음 + 법적 발송 기록).
export async function createPendingProductOrder(
  userId: string,
  productId: string,
  shipping: ShippingInput,
  paymentMethod: PaymentMethod = "card",
): Promise<CreateProductOrderResult> {
  const product = getProduct(productId);
  if (!product) return { ok: false, error: "상품을 찾을 수 없어요." };

  const recipientName = shipping.recipientName.trim();
  const recipientPhone = shipping.recipientPhone.trim();
  const postalCode = shipping.postalCode?.trim() || "";
  const address1 = shipping.address1.trim();
  if (!recipientName || !recipientPhone || !postalCode || !address1) {
    return { ok: false, error: "받는 분·연락처·우편번호·주소를 입력해 주세요." };
  }

  const quantity = 1; // v1 고정
  const { unitKrw, shippingKrw, totalKrw } = computeOrderAmount(
    product,
    quantity,
  );

  const order = await prisma.productOrder.create({
    data: {
      userId,
      productId: product.id,
      quantity,
      unitKrw,
      shippingKrw,
      totalKrw,
      recipientName,
      recipientPhone,
      postalCode,
      address1,
      address2: shipping.address2?.trim() || null,
      jibunAddress: shipping.jibunAddress?.trim() || null,
      deliveryMemo: shipping.deliveryMemo?.trim() || null,
      // 무통장은 입금대기로 접수(결제 없이), 카드는 결제창 대기.
      paymentMethod,
      status: paymentMethod === "bank_transfer" ? "awaiting_payment" : "pending",
    },
    select: { id: true },
  });

  return {
    ok: true,
    order: { orderId: order.id, totalKrw, orderName: product.name },
  };
}

export type SettleProductSuccess = {
  ok: true;
  alreadySettled: boolean;
  productName: string;
  totalKrw: number;
};

export type SettleProductFailure = {
  ok: false;
  reason:
    | "order_not_found"
    | "order_user_mismatch"
    | "order_already_failed"
    | "amount_mismatch";
};

/**
 * 토스가 승인한 결제를 pending 주문에 정산한다. 선행조건(success 페이지가
 * 보장): 이 값들로 confirmTossPayment 가 성공, tossAmount = 토스 보고 금액.
 *
 * 불변식(TokenOrder settle 과 동일):
 *   - 주문이 userId 소유
 *   - order.totalKrw === tossAmount (서버 금액 우선, 클라 쿼리스트링 불신)
 *   - 같은 paymentKey 두 번 정산 불가 (DB @unique + 상태 가드)
 * 토큰과 다른 점: 잔액 적립 없음 — status=paid + paymentKey 만 기록.
 */
export async function settleProductOrder(
  userId: string,
  orderId: string,
  paymentKey: string,
  tossAmount: number,
): Promise<SettleProductSuccess | SettleProductFailure> {
  // 결제 확정(paid 전환) 후 발주 어댑터를 1회 호출하기 위한 캡처.
  let fulfill: FulfillableOrder | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.productOrder.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false, reason: "order_not_found" } as const;
    if (order.userId !== userId)
      return { ok: false, reason: "order_user_mismatch" } as const;
    if (order.status === "failed" || order.status === "canceled")
      return { ok: false, reason: "order_already_failed" } as const;

    const product = getProduct(order.productId);
    const productName = product?.name ?? order.productId;

    // 이미 정산됨(paid 이상) + 같은 paymentKey → no-op.
    if (order.status !== "pending" && order.paymentKey === paymentKey) {
      return {
        ok: true,
        alreadySettled: true,
        productName,
        totalKrw: order.totalKrw,
      } as const;
    }

    // 서버 측 금액 검증 — 유일하게 신뢰하는 체크.
    if (order.totalKrw !== tossAmount) {
      await tx.productOrder.update({
        where: { id: orderId },
        data: {
          status: "failed",
          failedAt: new Date(),
          failReason: `amount_mismatch: order=${order.totalKrw} toss=${tossAmount}`,
        },
      });
      return { ok: false, reason: "amount_mismatch" } as const;
    }

    await tx.productOrder.update({
      where: { id: orderId },
      data: { status: "paid", paymentKey, approvedAt: new Date() },
    });

    fulfill = { id: order.id, productId: order.productId, optionId: order.optionId };

    return {
      ok: true,
      alreadySettled: false,
      productName,
      totalKrw: order.totalKrw,
    } as const;
  });

  // 트랜잭션 커밋 후 발주(현재 수동 no-op). 멱등 — 첫 paid 전환 때만.
  if (result.ok && !result.alreadySettled && fulfill) {
    await orderFulfiller.onOrderPaid(fulfill);
  }

  return result;
}

/**
 * success 페이지 재방문/새로고침 방어 — 이미 정산된(paid 이상) 주문이면
 * 토스 confirm 을 다시 부르지 않게 미리 알려준다(이미 처리된 결제엔 confirm
 * 이 에러를 던져 멀쩡한 주문인데 실패 화면이 뜸). 소유자 + 정산 완료일 때만
 * 값 반환, 아니면 null.
 */
export async function findSettledProductOrder(
  userId: string,
  orderId: string,
): Promise<{ productName: string; totalKrw: number } | null> {
  const order = await prisma.productOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, status: true, productId: true, totalKrw: true },
  });
  if (
    !order ||
    order.userId !== userId ||
    order.status === "pending" ||
    order.status === "awaiting_payment" ||
    order.status === "failed" ||
    order.status === "canceled"
  ) {
    return null;
  }
  const product = getProduct(order.productId);
  return {
    productName: product?.name ?? order.productId,
    totalKrw: order.totalKrw,
  };
}
