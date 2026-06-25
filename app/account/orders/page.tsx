import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  ORDER_STATUS_LABEL,
  REFUND_POLICY_LINES,
  isRefundable,
} from "@/lib/commerce/order-display";
import { getProduct, getProductOption } from "@/lib/commerce/products";

import { requestRefund } from "./actions";

// /account/orders — 내 주문 조회. 상태·송장·환불요청(발주 전).

const won = (n: number) => n.toLocaleString("ko-KR");

export const metadata = { title: "내 주문" };

export default async function MyOrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orders = await prisma.productOrder.findMany({
    where: { userId: session.user.id, status: { notIn: ["pending", "failed"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">내 주문</h1>

      {orders.length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">아직 주문하신 게 없어요.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => {
            const product = getProduct(o.productId);
            const option = product
              ? getProductOption(product, o.optionId)
              : undefined;
            const canRefund = isRefundable(o.status) && !o.refundRequestedAt;
            return (
              <li
                key={o.id}
                className="rounded-md border-2 border-line bg-surface px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-bold text-ink">
                    {product?.name ?? o.productId}
                    {option ? ` (${option.name})` : ""}
                  </span>
                  <span className="rounded-full bg-banner px-3 py-1 text-sm font-semibold text-action">
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </div>
                <p className="mt-1 text-base text-ink-soft">
                  {won(o.totalKrw)}원 · {o.createdAt.toLocaleDateString("ko-KR")}
                </p>

                {o.trackingNumber && (
                  <p className="mt-2 text-base text-ink">
                    송장: {o.trackingCarrier ?? ""} {o.trackingNumber}
                  </p>
                )}

                {o.refundRequestedAt && o.status !== "refunded" && (
                  <p className="mt-2 text-sm font-semibold text-rose-700">
                    환불 요청을 받았어요. 곧 처리해 드릴게요.
                  </p>
                )}

                {canRefund && (
                  <form action={requestRefund.bind(null, o.id)} className="mt-3">
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:bg-banner"
                    >
                      환불 요청하기
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-10 rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-base font-bold text-ink">환불·교환 안내</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {REFUND_POLICY_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <div className="mt-6">
        <Link
          href="/life-timeline"
          className="text-base font-semibold text-ink-soft underline hover:text-ink"
        >
          ← 인생 연혁으로
        </Link>
      </div>
    </main>
  );
}
