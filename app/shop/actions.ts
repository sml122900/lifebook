"use server";

import { auth } from "@/auth";
import {
  createPendingProductOrder,
  type CreatedProductOrder,
  type ShippingInput,
} from "@/lib/commerce/orders";

// 상품 주문을 PENDING ProductOrder 로 만든다. 클라는 productId + 배송지만
// 보내고, 서버가 정책 상수에서 정본 금액(단가·배송비·총액)을 기록한다.
// 토스 SDK 가 결제창을 열 때 필요한 orderId/총액/orderName 반환.
export async function startProductOrder(
  productId: string,
  shipping: ShippingInput,
): Promise<CreatedProductOrder> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const res = await createPendingProductOrder(
    session.user.id,
    productId,
    shipping,
  );
  if (!res.ok) {
    throw new Error(res.error);
  }
  return res.order;
}
