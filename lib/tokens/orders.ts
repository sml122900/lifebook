// Phase 8.5 — TokenOrder 생명주기.
//
// krw·tokens 모두 서버가 진실의 원천이다. 클라는 packageId 만 고르고,
// 나머지는 여기서 조회한다. 정산은 paymentKey 기준 idempotent(DB @unique)
// 라 토스의 중복 호출이 두 번 적립할 수 없다.

import { prisma } from "../db";
import { getPackage, TOPUP_DAILY_LIMIT_KRW, TOPUP_OPEN } from "./policy";

export type CreatedOrder = {
  orderId: string;
  packageId: string;
  krw: number;
  tokens: number;
  orderName: string;
};

// 하루 충전 한도(2026-11-10 — TOPUP_DAILY_LIMIT_KRW). 하루 = 한국 시간 0시부터. 그날 결제된(paid) 충전 금액 합계 — 환불한 충전도 센다(카드사 한도와 같이 보수적으로).
export class TopupDailyLimitError extends Error {
  constructor(public remainingKrw: number) {
    super("topup daily limit");
    this.name = "TopupDailyLimitError";
  }
}

function kstDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000);
}

export async function topupPaidTodayKrw(userId: string, now: Date = new Date()): Promise<number> {
  const r = await prisma.tokenOrder.aggregate({
    where: { userId, status: "paid", approvedAt: { gte: kstDayStart(now) } },
    _sum: { krw: true },
  });
  return r._sum.krw ?? 0;
}

// 오늘 더 충전할 수 있는 금액(0 이상).
export async function topupRemainingTodayKrw(userId: string, now: Date = new Date()): Promise<number> {
  return Math.max(0, TOPUP_DAILY_LIMIT_KRW - (await topupPaidTodayKrw(userId, now)));
}

// 결제 승인 전 다시 확인(/billing/success) — 대기 주문을 만든 뒤 다른 창에서 먼저 결제한 경우. 넘으면 남은 한도, 괜찮으면 null.
export async function checkTopupDailyLimit(userId: string, orderId: string, now: Date = new Date()): Promise<number | null> {
  const order = await prisma.tokenOrder.findUnique({ where: { id: orderId }, select: { userId: true, krw: true, status: true } });
  if (!order || order.userId !== userId || order.status !== "pending") return null; // 주문 문제는 settle 이 따로 거절
  const remaining = await topupRemainingTodayKrw(userId, now);
  return order.krw > remaining ? remaining : null;
}

export async function createPendingOrder(
  userId: string,
  packageId: string,
  now: Date = new Date(),
): Promise<CreatedOrder> {
  // 토큰 충전 비공개(2026-11-09 성민 — TOPUP_OPEN) — 화면을 거치지 않은 요청도 주문을 만들지 않는다.
  if (!TOPUP_OPEN) {
    throw new Error("topup closed");
  }
  const pkg = getPackage(packageId);
  if (!pkg) {
    throw new Error(`unknown package: ${packageId}`);
  }
  const remaining = await topupRemainingTodayKrw(userId, now);
  if (pkg.krw > remaining) {
    throw new TopupDailyLimitError(remaining);
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

/**
 * success 페이지 재방문/새로고침 방어 — 이미 정산된(paid) 주문이면 토스
 * confirm 을 다시 부르지 않게 미리 알려준다. confirm 은 이미 처리된 결제에
 * 대해 에러를 던지므로, 재호출 전에 이 체크로 "이미 충전됐어요" 화면으로
 * 분기한다. 소유자(userId) + status=paid 일 때만 값 반환, 아니면 null.
 */
export async function findSettledOrder(
  userId: string,
  orderId: string,
): Promise<{ balanceAfter: number } | null> {
  const order = await prisma.tokenOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, status: true },
  });
  if (!order || order.userId !== userId || order.status !== "paid") {
    return null;
  }
  const wallet = await prisma.tokenWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return { balanceAfter: wallet?.balance ?? 0 };
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
