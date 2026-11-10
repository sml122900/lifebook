"use server";

import { auth } from "@/auth";
import { createPendingOrder, TopupDailyLimitError, type CreatedOrder } from "@/lib/tokens/orders";

// Phase 8.5 — packageId 를 PENDING TokenOrder 로 만든다. 클라는 패키지
// id "만" 보내고, 서버가 정책에서 정본 krw+tokens 를 기록한다. 토스 SDK
// 가 결제창을 열 때 필요한 id/값을 반환.
// 2026-11-10 — 하루 충전 한도(TOPUP_DAILY_LIMIT_KRW)에 걸리면 주문 없이 남은 한도를 돌려준다.
export type StartTopupResult = { ok: true; order: CreatedOrder } | { ok: false; reason: "limit"; remainingKrw: number };

export async function startTopup(packageId: string): Promise<StartTopupResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  try {
    return { ok: true, order: await createPendingOrder(session.user.id, packageId) };
  } catch (e) {
    if (e instanceof TopupDailyLimitError) return { ok: false, reason: "limit", remainingKrw: e.remainingKrw };
    throw e;
  }
}
