import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/commerce/order-display";
import { getProduct, getProductOption } from "@/lib/commerce/products";
import type { PosterSnapshot } from "@/lib/poster/snapshot";

import { PosterCompose } from "../../../poster/PosterCompose";
import { processRefund, setTracking, updateOrderStatus } from "../actions";

const won = (n: number) => n.toLocaleString("ko-KR");
const dt = (d: Date | null) => (d ? d.toLocaleString("ko-KR") : "—");

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await prisma.productOrder.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!order) notFound();

  const product = getProduct(order.productId);
  const option = product ? getProductOption(product, order.optionId) : undefined;
  const snapshot = order.posterSnapshot as unknown as PosterSnapshot | null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/orders" className="text-sm text-ink-soft hover:text-ink">
          ← 목록
        </Link>
        <span className="rounded-full bg-banner px-3 py-1 text-sm font-bold text-action">
          {ORDER_STATUS_LABEL[order.status]}
          {!order.paymentLive && " · 테스트"}
        </span>
      </div>

      {/* 주문 요약 */}
      <section className="rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-lg font-bold text-ink">
          {product?.name ?? order.productId}
          {option ? ` (${option.name})` : ""}
        </h2>
        <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
          <dt className="text-ink-faint">금액</dt>
          <dd className="text-ink">
            {won(order.totalKrw)}원 (상품 {won(order.unitKrw)} + 배송 {won(order.shippingKrw)})
          </dd>
          <dt className="text-ink-faint">주문자</dt>
          <dd className="text-ink">{order.user?.name ?? order.user?.email ?? "탈퇴"}</dd>
          <dt className="text-ink-faint">결제키</dt>
          <dd className="break-all text-ink">{order.paymentKey ?? "—"}</dd>
          <dt className="text-ink-faint">주문일</dt>
          <dd className="text-ink">{dt(order.createdAt)}</dd>
          <dt className="text-ink-faint">승인일</dt>
          <dd className="text-ink">{dt(order.approvedAt)}</dd>
          {order.refundRequestedAt && (
            <>
              <dt className="text-ink-faint">환불요청</dt>
              <dd className="font-bold text-rose-700">{dt(order.refundRequestedAt)}</dd>
            </>
          )}
          {order.refundedAt && (
            <>
              <dt className="text-ink-faint">환불완료</dt>
              <dd className="text-ink">{dt(order.refundedAt)}</dd>
            </>
          )}
        </dl>
      </section>

      {/* 배송지 */}
      <section className="rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-base font-bold text-ink">배송지</h2>
        <p className="mt-2 text-sm text-ink">
          {order.recipientName} · {order.recipientPhone}
        </p>
        <p className="text-sm text-ink">
          ({order.postalCode ?? "—"}) {order.address1} {order.address2 ?? ""}
        </p>
        {order.deliveryMemo && (
          <p className="text-sm text-ink-soft">메모: {order.deliveryMemo}</p>
        )}
      </section>

      {/* 인쇄 파일(스냅샷) — 발주용. PosterCompose 의 "인쇄용 파일 내려받기"로 export */}
      {snapshot && (
        <section className="rounded-md border-2 border-line bg-surface px-5 py-4">
          <h2 className="mb-3 text-base font-bold text-ink">인쇄 파일(주문 시점 스냅샷)</h2>
          <PosterCompose
            ownerName={snapshot.ownerName}
            nodes={snapshot.nodes}
            memos={snapshot.memos}
          />
        </section>
      )}

      {/* 상태 변경 */}
      <section className="rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-base font-bold text-ink">상태 변경</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["preparing", "발주(제작 시작)"],
              ["shipped", "배송 중"],
              ["delivered", "배송 완료"],
              ["canceled", "취소"],
            ] as const
          ).map(([status, label]) => (
            <form key={status} action={updateOrderStatus.bind(null, order.id, status)}>
              <button
                type="submit"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:bg-banner"
              >
                {label}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* 송장 입력 */}
      <section className="rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 className="text-base font-bold text-ink">송장</h2>
        <form action={setTracking.bind(null, order.id)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-ink-soft">
            택배사
            <input
              name="carrier"
              defaultValue={order.trackingCarrier ?? ""}
              placeholder="예: CJ대한통운"
              className="rounded-md border-2 border-line bg-canvas px-3 py-2 text-base text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-soft">
            송장번호
            <input
              name="number"
              defaultValue={order.trackingNumber ?? ""}
              placeholder="숫자"
              className="rounded-md border-2 border-line bg-canvas px-3 py-2 text-base text-ink"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-action px-4 py-2 text-sm font-bold text-white hover:bg-action-hover"
          >
            저장(발송 처리)
          </button>
        </form>
      </section>

      {/* 환불(발주 전 = paid 상태만) */}
      {order.status === "paid" && (
        <section className="rounded-md border-2 border-rose-200 bg-rose-50 px-5 py-4">
          <h2 className="text-base font-bold text-rose-900">환불 처리</h2>
          <p className="mt-1 text-sm text-rose-800">
            발주(제작) 전이라 환불할 수 있어요.
            {order.refundRequestedAt && " 사용자가 환불을 요청했어요."}
          </p>
          <form action={processRefund.bind(null, order.id)} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="reason"
              placeholder="환불 사유(선택)"
              className="flex-1 rounded-md border-2 border-rose-200 bg-white px-3 py-2 text-base text-ink"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-rose-500 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-500 hover:text-white"
            >
              환불 처리
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
