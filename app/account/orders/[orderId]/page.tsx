import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/commerce/order-display";
import { getProduct, getProductOption } from "@/lib/commerce/products";

import { BankDepositGuide } from "../BankDepositGuide";

// /account/orders/[orderId] — 내 주문 상세. 무통장 주문 접수 직후 입금 안내
// 화면 + 재방문 조회 겸용. /shop 밖이라 "테스트 결제" 배너 없음(무통장=실주문).

const won = (n: number) => n.toLocaleString("ko-KR");

export const metadata = { title: "주문 상세" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { orderId } = await params;

  // 본인 주문만 — userId 스코프.
  const order = await prisma.productOrder.findFirst({
    where: { id: orderId, userId: session.user.id },
  });
  if (!order) notFound();

  const product = getProduct(order.productId);
  const option = product
    ? getProductOption(product, order.optionId)
    : undefined;
  const isBankAwaiting =
    order.paymentMethod === "bank_transfer" &&
    order.status === "awaiting_payment";
  const isBankPaid =
    order.paymentMethod === "bank_transfer" && order.status === "paid";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">주문이 접수됐어요</h1>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-md border-2 border-line bg-surface px-5 py-4">
        <span className="text-lg font-bold text-ink">
          {product?.name ?? order.productId}
          {option ? ` (${option.name})` : ""}
        </span>
        <span className="rounded-full bg-banner px-3 py-1 text-sm font-semibold text-action">
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>
      <p className="mt-2 text-lg text-ink">
        {won(order.totalKrw)}원 (상품 {won(order.unitKrw)} + 배송{" "}
        {won(order.shippingKrw)})
      </p>

      {/* 무통장 입금 대기 → 입금 안내 */}
      {isBankAwaiting && (
        <div className="mt-6">
          <BankDepositGuide
            amount={order.totalKrw}
            orderId={order.id}
            ordererName={session.user.name}
          />
        </div>
      )}

      {/* 무통장 입금 확인됨 */}
      {isBankPaid && (
        <p
          role="note"
          className="mt-6 rounded-md border-2 border-brand bg-banner px-5 py-4 text-lg font-semibold text-ink"
        >
          입금이 확인됐어요. 곧 제작을 시작할게요.
        </p>
      )}

      {/* 배송지 */}
      <section className="mt-6 rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-base font-bold text-ink">받는 곳</h2>
        <p className="mt-2 text-base text-ink">
          {order.recipientName} · {order.recipientPhone}
        </p>
        <p className="text-base text-ink">
          ({order.postalCode ?? "—"}) {order.address1} {order.address2 ?? ""}
        </p>
        {order.trackingNumber && (
          <p className="mt-2 text-base text-ink">
            송장: {order.trackingCarrier ?? ""} {order.trackingNumber}
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/account/orders"
          className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-base font-semibold text-ink hover:bg-banner"
        >
          내 주문 전체 보기
        </Link>
        <Link
          href="/life-timeline"
          className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-base font-semibold text-ink hover:bg-banner"
        >
          인생 연혁으로
        </Link>
      </div>
    </main>
  );
}
