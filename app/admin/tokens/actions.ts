"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { refundTopupOrder } from "@/lib/tokens/refund-exec";

// 토큰 충전 환불(2026-11-10) — 호출마다 ADMIN_EMAILS 재검증(proxy · 레이아웃 게이트와 별개, 3중).
// 금액 확인 체크가 있어야 실행. 결과는 /admin/tokens?r=…&o=… 로 돌아가 화면에 한 줄.
export async function refundTopupAction(formData: FormData) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) throw new Error("권한이 없어요.");
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) throw new Error("주문 번호가 없어요.");
  if (formData.get("confirm") !== "on") redirect(`/admin/tokens?r=need_confirm&o=${encodeURIComponent(orderId)}`);
  const r = await refundTopupOrder(orderId);
  revalidatePath("/admin/tokens");
  revalidatePath("/account/tokens");
  revalidatePath("/billing");
  const code = r.ok ? `ok:${r.refundKrw}:${r.refundTokens}` : r.reason === "cancel_failed" ? `cancel_failed:${r.code}` : r.reason;
  redirect(`/admin/tokens?r=${encodeURIComponent(code)}&o=${encodeURIComponent(orderId)}`);
}
