"use server";

import { auth } from "@/auth";
import { createPendingOrder, type CreatedOrder } from "@/lib/tokens/orders";

// Phase 8.5 — packageId 를 PENDING TokenOrder 로 만든다. 클라는 패키지
// id "만" 보내고, 서버가 정책에서 정본 krw+tokens 를 기록한다. 토스 SDK
// 가 결제창을 열 때 필요한 id/값을 반환.
export async function startTopup(packageId: string): Promise<CreatedOrder> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return createPendingOrder(session.user.id, packageId);
}
