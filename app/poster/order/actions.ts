"use server";

import { auth } from "@/auth";
import { createPendingPosterOrder } from "@/lib/commerce/poster-orders";
import type { CreatedProductOrder, ShippingInput } from "@/lib/commerce/orders";

// 포스터 주문 시작 — PENDING ProductOrder(재질·스냅샷 포함) 생성 후 결제창용
// 총액/orderId 반환. 금액·스냅샷은 서버가 결정(클라 불신).
export async function startPosterOrder(
  optionId: string,
  shipping: ShippingInput,
): Promise<CreatedProductOrder> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const result = await createPendingPosterOrder(
    session.user.id,
    session.user.name ?? "",
    optionId,
    shipping,
  );
  if (!result.ok) throw new Error(result.error);
  return result.order;
}
