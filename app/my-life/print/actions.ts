"use server";

// My Life 인쇄본 — 편집 상태 저장·주문 생성(2026-11-08). 로그인 확인만 하고 본체는 lib/commerce/print-orders.

import { auth } from "@/auth";
import type { CreatedProductOrder, ShippingInput } from "@/lib/commerce/orders";
import { createPendingPrintOrder, savePrintDraft } from "@/lib/commerce/print-orders";
import { PRINT_COPY as T } from "@/lib/print-copy";

export async function savePrintDraftAction(raw: unknown): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  try {
    await savePrintDraft(session.user.id, raw);
    return { ok: true };
  } catch (e) {
    console.error("[print] 편집 상태 저장 실패", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

export async function startPrintOrderAction(
  raw: unknown,
  shipping: ShippingInput,
): Promise<{ ok: true; order: CreatedProductOrder } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: T.orderFailed };
  try {
    const res = await createPendingPrintOrder(session.user.id, raw, shipping);
    return res.ok ? { ok: true, order: res.order } : { ok: false, error: res.error };
  } catch (e) {
    console.error("[print] 주문 생성 실패", e instanceof Error ? e.message : e);
    return { ok: false, error: T.orderFailed };
  }
}
