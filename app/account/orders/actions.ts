"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 환불 요청 — 발주 전(paid)·본인·미요청일 때만. updateMany 가드로 원자적 소유 검증.
// 실제 환불 처리는 관리자(/admin/orders)가 한다(여기선 요청 표시만).
export async function requestRefund(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const res = await prisma.productOrder.updateMany({
    where: {
      id: orderId,
      userId: session.user.id,
      status: "paid",
      refundRequestedAt: null,
    },
    data: { refundRequestedAt: new Date() },
  });
  if (res.count === 0) {
    throw new Error(
      "환불을 요청할 수 없어요. 이미 제작이 시작됐거나 요청한 주문이에요.",
    );
  }
  revalidatePath("/account/orders");
}
