// Phase 8.5 — TokenOrder lifecycle.
//
// Server is the source of truth for both krw and tokens. The client
// only chooses a packageId; we look the rest up here. Settle is
// idempotent on paymentKey (DB @unique) so a double-call from Toss
// can't credit twice.

import { prisma } from "../db";
import { getPackage } from "./policy";

export type CreatedOrder = {
  orderId: string;
  packageId: string;
  krw: number;
  tokens: number;
  orderName: string;
};

export async function createPendingOrder(
  userId: string,
  packageId: string,
): Promise<CreatedOrder> {
  const pkg = getPackage(packageId);
  if (!pkg) {
    throw new Error(`unknown package: ${packageId}`);
  }
  const order = await prisma.tokenOrder.create({
    data: {
      userId,
      packageId: pkg.id,
      krw: pkg.krw,
      tokens: pkg.tokens,
      status: "pending",
    },
    select: { id: true },
  });
  return {
    orderId: order.id,
    packageId: pkg.id,
    krw: pkg.krw,
    tokens: pkg.tokens,
    orderName: pkg.label,
  };
}

export type SettleSuccess = {
  ok: true;
  alreadySettled: boolean;
  tokensCredited: number;
  balanceAfter: number;
};

export type SettleFailure = {
  ok: false;
  reason:
    | "order_not_found"
    | "order_user_mismatch"
    | "order_already_failed"
    | "amount_mismatch";
};

/**
 * Settle a Toss-confirmed payment against the pending order.
 *
 * Pre-conditions caller MUST satisfy:
 *   - Toss /v1/payments/confirm has succeeded with these values
 *   - Toss-reported totalAmount is passed in `tossAmount`
 *
 * Invariants enforced here:
 *   - order belongs to userId
 *   - order.krw === tossAmount (the server's own amount wins; we never
 *     trust the client query string)
 *   - same paymentKey can't credit twice (DB @unique catches races)
 */
export async function settleOrderAfterToss(
  userId: string,
  orderId: string,
  paymentKey: string,
  tossAmount: number,
): Promise<SettleSuccess | SettleFailure> {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.tokenOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) return { ok: false, reason: "order_not_found" } as const;
    if (order.userId !== userId)
      return { ok: false, reason: "order_user_mismatch" } as const;
    if (order.status === "failed" || order.status === "canceled")
      return { ok: false, reason: "order_already_failed" } as const;

    // If already PAID with the same paymentKey, just report no-op.
    if (order.status === "paid" && order.paymentKey === paymentKey) {
      const wallet = await tx.tokenWallet.findUnique({
        where: { userId },
        select: { balance: true },
      });
      return {
        ok: true,
        alreadySettled: true,
        tokensCredited: 0,
        balanceAfter: wallet?.balance ?? 0,
      } as const;
    }

    // Server-side amount check — the only one that matters.
    if (order.krw !== tossAmount) {
      await tx.tokenOrder.update({
        where: { id: orderId },
        data: {
          status: "failed",
          failedAt: new Date(),
          failReason: `amount_mismatch: order=${order.krw} toss=${tossAmount}`,
        },
      });
      return { ok: false, reason: "amount_mismatch" } as const;
    }

    // Credit wallet + ledger together. The wallet should already exist
    // (created at signup) but upsert defends against odd states.
    const wallet = await tx.tokenWallet.upsert({
      where: { userId },
      create: { userId, balance: order.tokens },
      update: { balance: { increment: order.tokens } },
      select: { balance: true },
    });
    await tx.tokenTransaction.create({
      data: {
        userId,
        delta: order.tokens,
        reason: "topup",
        refId: orderId,
      },
    });
    await tx.tokenOrder.update({
      where: { id: orderId },
      data: {
        status: "paid",
        paymentKey,
        approvedAt: new Date(),
      },
    });

    return {
      ok: true,
      alreadySettled: false,
      tokensCredited: order.tokens,
      balanceAfter: wallet.balance,
    } as const;
  });
}

export async function markOrderFailed(
  orderId: string,
  reason: string,
): Promise<void> {
  await prisma.tokenOrder.updateMany({
    where: { id: orderId, status: "pending" },
    data: {
      status: "failed",
      failedAt: new Date(),
      failReason: reason,
    },
  });
}
