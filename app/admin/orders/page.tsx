import Link from "next/link";

import { prisma } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/commerce/order-display";
import { getProduct, getProductOption } from "@/lib/commerce/products";

// /admin/orders — 주문 목록(최신순). 게이트는 layout 에서.

const won = (n: number) => n.toLocaleString("ko-KR");

export default async function AdminOrdersPage() {
  const orders = await prisma.productOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      productId: true,
      optionId: true,
      totalKrw: true,
      status: true,
      paymentLive: true,
      recipientName: true,
      refundRequestedAt: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-bold text-ink">주문 {orders.length}건</h1>

      {orders.length === 0 ? (
        <p className="text-ink-soft">아직 주문이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const product = getProduct(o.productId);
            const option = product ? getProductOption(product, o.optionId) : undefined;
            return (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-line bg-surface px-4 py-3 hover:bg-banner"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-ink">
                      {product?.name ?? o.productId}
                      {option ? ` (${option.name})` : ""}
                      {o.refundRequestedAt && (
                        <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                          환불요청
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {o.recipientName} · {o.user?.name ?? o.user?.email ?? "탈퇴"} ·{" "}
                      {o.createdAt.toLocaleDateString("ko-KR")}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-bold text-ink">{won(o.totalKrw)}원</span>
                    <span className="text-sm text-ink-soft">
                      {ORDER_STATUS_LABEL[o.status]}
                      {!o.paymentLive && " · 테스트"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
