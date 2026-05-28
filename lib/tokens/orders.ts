// Phase 8.5 — TokenOrder 생명주기.
//
// krw·tokens 모두 서버가 진실의 원천이다. 클라는 packageId 만 고르고,
// 나머지는 여기서 조회한다. 정산은 paymentKey 기준 idempotent(DB @unique)
// 라 토스의 중복 호출이 두 번 적립할 수 없다.

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
 * 토스가 승인한 결제를 pending 주문에 정산한다.
 *
 * 호출자가 반드시 충족해야 할 선행조건:
 *   - 이 값들로 토스 /v1/payments/confirm 이 성공했음
 *   - 토스가 보고한 totalAmount 를 `tossAmount` 로 전달
 *
 * 여기서 강제하는 불변식:
 *   - 주문이 userId 소유
 *   - order.krw === tossAmount (서버 자체 금액이 우선 — 클라 쿼리스트링은
 *     절대 신뢰 안 함)
 *   - 같은 paymentKey 로 두 번 적립 불가 (DB @unique 가 race 차단)
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

    // 같은 paymentKey 로 이미 PAID 면 no-op 으로 보고.
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

    // 서버 측 금액 검증 — 유일하게 신뢰하는 체크.
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

    // 지갑 적립 + ledger 를 함께. 지갑은 가입 때 이미 생겼어야 하지만,
    // 이상 상태 방어를 위해 upsert.
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
