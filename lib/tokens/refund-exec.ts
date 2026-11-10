// 토큰 충전 환불 실행(2026-11-10 성민 — 관리자 화면 /admin/tokens 에서 한 번에): 금액 계산 → 토스 결제 취소(부분 취소 포함) → 원장 차감.
//
// 순서(한 트랜잭션):
//   1. 충전 주문 행·지갑 행을 잠금(SELECT … FOR UPDATE) — 같은 충전을 동시에 두 번 환불하거나, 계산 중에 토큰이 쓰이는 것을 막음
//      (차감 코드는 지갑 행 UPDATE 라 잠금이 풀릴 때까지 기다림).
//   2. 이미 환불한 충전(원장에 topup_refund · refId = 주문 id)이면 거절.
//   3. 원장을 다시 따라가 남은 토큰·환불 금액 계산(lib/tokens/refund — 무료 먼저 · 먼저 충전한 것부터 · 7일 안 안 쓴 충전 전액 · 그 밖 비례).
//   4. 토스 취소(금액 = 결제 금액 전부면 전액 취소, 아니면 부분 취소 · Idempotency-Key = 주문마다 하나). 실패하면 아무것도 쓰지 않고 끝 — 원장 그대로.
//   5. 성공하면 지갑에서 남은 토큰을 빼고 원장에 topup_refund 한 줄(사용자 토큰 화면 내역에 "충전 환불"로 보임).
// 주문 행은 paid 그대로(결제 기록 5년 보존 — 탈퇴 때 지우는 대상 아님). 환불 금액 = refundKrwFor(주문, 원장의 환불 토큰).
// 토스는 취소했는데 5단계 DB 쓰기가 실패하면: 다시 실행하면 같은 Idempotency-Key 라 토스는 같은 취소 결과를 돌려주고 원장이 그때 써진다.

import { prisma } from "../db";
import { quoteTopupRefunds } from "./refund";
import { cancelTossPayment, TossConfirmError } from "./toss";

// 이 시각 뒤에 만든 충전 = 결제위젯 키(옛 결제창 키는 그 전 — 충전은 2026-11-09~10 닫혀 있었음). 취소는 결제한 키로 해야 한다.
export const TOPUP_WIDGET_SINCE = new Date("2026-11-10T00:00:00+09:00");
export const TOPUP_REFUND_REASON = "topup_refund";

export type TopupCancelArgs = { paymentKey: string; cancelAmount: number; fullCancel: boolean; widget: boolean; idempotencyKey: string; cancelReason: string };
export type TopupCancelFn = (a: TopupCancelArgs) => Promise<void>;

export type TopupRefundResult =
  | { ok: true; refundKrw: number; refundTokens: number; balanceAfter: number }
  | { ok: false; reason: "not_found" | "not_paid" | "withdrawn" | "already_refunded" | "expired" | "nothing_to_refund" }
  | { ok: false; reason: "cancel_failed"; code: string; message: string };

const tossCancel: TopupCancelFn = async (a) => {
  await cancelTossPayment(
    a.paymentKey,
    a.fullCancel ? { cancelReason: a.cancelReason } : { cancelReason: a.cancelReason, cancelAmount: a.cancelAmount },
    { widget: a.widget, idempotencyKey: a.idempotencyKey },
  );
};

type OrderRow = { id: string; userId: string | null; krw: number; tokens: number; status: string; paymentKey: string | null; createdAt: Date };

export async function refundTopupOrder(
  orderId: string,
  opts: { cancel?: TopupCancelFn; now?: Date; cancelReason?: string } = {},
): Promise<TopupRefundResult> {
  const cancel = opts.cancel ?? tossCancel;
  const now = opts.now ?? new Date();
  return prisma.$transaction(
    async (tx): Promise<TopupRefundResult> => {
      const [o] = await tx.$queryRaw<OrderRow[]>`
        SELECT id, "userId", krw, tokens, status::text AS status, "paymentKey", "createdAt"
        FROM "TokenOrder" WHERE id = ${orderId} FOR UPDATE`;
      if (!o) return { ok: false, reason: "not_found" };
      if (o.status !== "paid" || !o.paymentKey) return { ok: false, reason: "not_paid" };
      if (!o.userId) return { ok: false, reason: "withdrawn" };
      const userId = o.userId;
      const [wallet] = await tx.$queryRaw<{ balance: number }[]>`SELECT balance FROM "TokenWallet" WHERE "userId" = ${userId} FOR UPDATE`;
      if (await tx.tokenTransaction.findFirst({ where: { userId, reason: TOPUP_REFUND_REASON, refId: orderId }, select: { id: true } })) {
        return { ok: false, reason: "already_refunded" };
      }
      const [ledger, orders] = await Promise.all([
        tx.tokenTransaction.findMany({ where: { userId }, select: { id: true, delta: true, reason: true, refId: true, createdAt: true } }),
        tx.tokenOrder.findMany({ where: { userId, status: "paid" }, select: { id: true, krw: true, tokens: true, approvedAt: true } }),
      ]);
      const q = quoteTopupRefunds(ledger, orders, now).quotes.find((x) => x.orderId === orderId);
      // 유효기간(충전일로부터 1년) 지난 충전 — 소멸·환불은 법률 검토 뒤라 자동 환불하지 않음
      if (q?.expired) return { ok: false, reason: "expired" };
      if (!q || q.refundKrw <= 0 || q.remaining <= 0 || !wallet || wallet.balance < q.remaining) return { ok: false, reason: "nothing_to_refund" };

      try {
        await cancel({
          paymentKey: o.paymentKey,
          cancelAmount: q.refundKrw,
          fullCancel: q.refundKrw === o.krw,
          widget: o.createdAt >= TOPUP_WIDGET_SINCE,
          idempotencyKey: `token-refund-${orderId}`,
          cancelReason: opts.cancelReason ?? "토큰 충전 환불(고객 요청)",
        });
      } catch (e) {
        // 취소 실패 — 아직 아무것도 안 썼으므로 원장·지갑 그대로(트랜잭션은 읽기·잠금만 하고 끝남)
        if (e instanceof TossConfirmError) return { ok: false, reason: "cancel_failed", code: e.code, message: e.message };
        return { ok: false, reason: "cancel_failed", code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) };
      }

      const [after] = await tx.$queryRaw<{ balance: number }[]>`
        UPDATE "TokenWallet" SET balance = balance - ${q.remaining}, "updatedAt" = NOW()
        WHERE "userId" = ${userId} RETURNING balance`;
      await tx.tokenTransaction.create({ data: { userId, delta: -q.remaining, reason: TOPUP_REFUND_REASON, refId: orderId } });
      return { ok: true, refundKrw: q.refundKrw, refundTokens: q.remaining, balanceAfter: after.balance };
    },
    { timeout: 20_000, maxWait: 5_000 }, // 토스 호출(보통 1초 안팎)을 잠금 안에서 기다림
  );
}

// 한 사용자의 충전별 계산(남은 토큰·만료·환불 금액) — 토큰 화면 만료 안내(2026-11-10)·운영자 조회가 씀.
export async function getTopupQuotes(userId: string, now: Date = new Date()) {
  const [ledger, paid] = await Promise.all([
    prisma.tokenTransaction.findMany({ where: { userId }, select: { id: true, delta: true, reason: true, refId: true, createdAt: true } }),
    prisma.tokenOrder.findMany({ where: { userId, status: "paid" }, select: { id: true, krw: true, tokens: true, approvedAt: true } }),
  ]);
  return quoteTopupRefunds(ledger, paid, now);
}

// 관리자 목록 — 결제된 충전(최근 순)과 환불 계산. 사용자별 원장을 한 번씩 읽음.
export async function listTopupOrdersForAdmin(limit = 100, now: Date = new Date()) {
  const orders = await prisma.tokenOrder.findMany({
    where: { status: "paid" },
    orderBy: { approvedAt: "desc" },
    take: limit,
    select: { id: true, userId: true, krw: true, tokens: true, approvedAt: true, createdAt: true, user: { select: { email: true, name: true } } },
  });
  const userIds = [...new Set(orders.map((o) => o.userId).filter((u): u is string => !!u))];
  const quotes = new Map<string, ReturnType<typeof quoteTopupRefunds>["quotes"][number]>();
  for (const userId of userIds) {
    for (const q of (await getTopupQuotes(userId, now)).quotes) quotes.set(q.orderId, q);
  }
  return orders.map((o) => ({ ...o, quote: quotes.get(o.id) ?? null }));
}
