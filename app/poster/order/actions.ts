"use server";

import { auth } from "@/auth";
import { createPendingPosterOrder } from "@/lib/commerce/poster-orders";
import type {
  CreateProductOrderResult,
  PaymentMethod,
  ShippingInput,
} from "@/lib/commerce/orders";

// 포스터 주문 시작 — PENDING(카드)/입금대기(무통장) ProductOrder(재질·스냅샷
// 포함) 생성 후 총액/orderId 반환. 금액·스냅샷은 서버가 결정(클라 불신).
// 실패는 throw 대신 결과값으로 — 운영 빌드는 서버 액션이 던진 오류 메시지를
// 일반 문구로 가려서, 안내 문구가 화면에 안 보인다.
export async function startPosterOrder(
  optionId: string,
  shipping: ShippingInput,
  paymentMethod: PaymentMethod = "card",
): Promise<CreateProductOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  return createPendingPosterOrder(
    session.user.id,
    session.user.name ?? "",
    optionId,
    shipping,
    paymentMethod,
  );
}
