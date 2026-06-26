"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import type { ProductOrderStatus } from "@/lib/generated/prisma/enums";

// 모든 액션은 호출마다 ADMIN_EMAILS 권위적 재검증(레이아웃 게이트와 별개).
async function requireAdmin() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) throw new Error("권한이 없어요.");
}

function revalidate(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

const STATUS_SETTABLE: ProductOrderStatus[] = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "canceled",
];

export async function updateOrderStatus(
  orderId: string,
  status: ProductOrderStatus,
) {
  await requireAdmin();
  if (!STATUS_SETTABLE.includes(status)) throw new Error("허용되지 않은 상태예요.");
  await prisma.productOrder.update({
    where: { id: orderId },
    data: {
      status,
      ...(status === "shipped" ? { shippedAt: new Date() } : {}),
    },
  });
  revalidate(orderId);
}

// 무통장입금 입금 확인 — awaiting_payment(입금대기) 무통장 주문을 paid 로.
// 이후 카드 결제 paid 와 동일하게 제작/배송 흐름 진입.
export async function confirmBankPayment(orderId: string) {
  await requireAdmin();
  const order = await prisma.productOrder.findUnique({
    where: { id: orderId },
    select: { status: true, paymentMethod: true },
  });
  if (!order) throw new Error("주문을 찾을 수 없어요.");
  if (order.paymentMethod !== "bank_transfer" || order.status !== "awaiting_payment") {
    throw new Error("입금대기 중인 무통장 주문만 확인할 수 있어요.");
  }
  await prisma.productOrder.update({
    where: { id: orderId },
    data: { status: "paid", approvedAt: new Date() },
  });
  revalidate(orderId);
}

export async function setTracking(orderId: string, formData: FormData) {
  await requireAdmin();
  const carrier = String(formData.get("carrier") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  await prisma.productOrder.update({
    where: { id: orderId },
    data: {
      trackingCarrier: carrier || null,
      trackingNumber: number || null,
      // 송장 입력 = 발송으로 간주(상태가 그 전이면 shipped 로 올림).
      ...(number ? { status: "shipped", shippedAt: new Date() } : {}),
    },
  });
  revalidate(orderId);
}

export async function processRefund(orderId: string, formData: FormData) {
  await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  const order = await prisma.productOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("주문을 찾을 수 없어요.");
  // 발주(제작) 전 = paid 상태만 환불. (preparing 이후는 제작 착수라 불가.)
  if (order.status !== "paid") {
    throw new Error("발주 전(접수) 상태만 환불할 수 있어요.");
  }
  // TODO(live): paymentLive && paymentKey 면 Toss 결제취소 API 호출 자리.
  await prisma.productOrder.update({
    where: { id: orderId },
    data: {
      status: "refunded",
      refundedAt: new Date(),
      refundReason: reason || "관리자 환불",
    },
  });
  revalidate(orderId);
}
