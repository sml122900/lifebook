// Phase 8.2 — wallet helpers.
//
// Invariants enforced everywhere here:
//   1. Every read / write is userId-scoped.
//   2. Every balance change goes through a single $transaction that
//      writes BOTH the TokenWallet row and a TokenTransaction row.
//      Never touch wallet.balance alone — reconcileBalance() depends
//      on the two staying in sync.
//   3. Signup grant is idempotent. TokenWallet.userId is @unique, so
//      ensureWalletWithSignupGrant() can be called from anywhere
//      without risk of double-granting.

import { prisma } from "../db";
import { SIGNUP_GRANT_TOKENS } from "./policy";

export type ReconcileReport = {
  walletBalance: number;
  transactionSum: number;
  match: boolean;
};

/**
 * Create the user's wallet with the free signup grant if it doesn't
 * exist yet. Safe to call on every login — the unique(userId) gate
 * means the grant only happens once. Returns the (possibly pre-
 * existing) wallet.
 */
export async function ensureWalletWithSignupGrant(userId: string) {
  // Fast path: if a wallet already exists we never touch it. This is
  // the actual idempotency gate — the unique constraint is the
  // backstop in case two requests race.
  const existing = await prisma.tokenWallet.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.create({
        data: { userId, balance: SIGNUP_GRANT_TOKENS },
      });
      await tx.tokenTransaction.create({
        data: {
          userId,
          delta: SIGNUP_GRANT_TOKENS,
          reason: "signup_grant",
        },
      });
      return wallet;
    });
  } catch (err: unknown) {
    // P2002 unique violation = a parallel call beat us to it. Re-read
    // and return whatever was created — no second grant.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const w = await prisma.tokenWallet.findUnique({ where: { userId } });
      if (w) return w;
    }
    throw err;
  }
}

/**
 * Audit check: wallet.balance must equal SUM(transactions.delta) for
 * the same user. Anyone updating tokens outside the helpers in this
 * file will diverge — that's the signal we'd want to catch.
 */
export async function reconcileBalance(userId: string): Promise<ReconcileReport> {
  const [wallet, sum] = await Promise.all([
    prisma.tokenWallet.findUnique({
      where: { userId },
      select: { balance: true },
    }),
    prisma.tokenTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    }),
  ]);
  const walletBalance = wallet?.balance ?? 0;
  const transactionSum = sum._sum.delta ?? 0;
  return {
    walletBalance,
    transactionSum,
    match: walletBalance === transactionSum,
  };
}

/**
 * Read-only balance lookup. Returns 0 if the wallet doesn't exist yet
 * (which shouldn't happen post-signup, but keep this safe).
 */
export async function getBalance(userId: string): Promise<number> {
  const w = await prisma.tokenWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return w?.balance ?? 0;
}
