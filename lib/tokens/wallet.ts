// Phase 8.2 — 토큰 지갑 헬퍼.
//
// 여기서 항상 지키는 불변식:
//   1. 모든 읽기/쓰기는 userId 범위로 한정한다.
//   2. 모든 잔액 변경은 TokenWallet 행과 TokenTransaction 행을 함께
//      기록하는 단일 $transaction 을 거친다. wallet.balance 만 단독으로
//      건드리지 말 것 — reconcileBalance() 가 둘의 동기화에 의존한다.
//   3. 신규 가입 지급은 idempotent. TokenWallet.userId 가 @unique 라
//      ensureWalletWithSignupGrant() 를 어디서 불러도 이중 지급 위험이 없다.

import { prisma } from "../db";
import { SIGNUP_GRANT_TOKENS } from "./policy";

export type ReconcileReport = {
  walletBalance: number;
  transactionSum: number;
  match: boolean;
};

/**
 * 지갑이 아직 없으면 무료 가입 지급과 함께 생성한다. 매 로그인마다
 * 불러도 안전 — unique(userId) 게이트가 지급을 한 번만 일어나게 한다.
 * (이미 있을 수도 있는) 지갑을 반환.
 */
export async function ensureWalletWithSignupGrant(userId: string) {
  // 빠른 경로: 지갑이 이미 있으면 절대 건드리지 않는다. 이게 실제
  // idempotency 게이트이고, unique 제약은 두 요청이 경합할 때의 안전망.
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
    // P2002 unique 위반 = 병렬 호출이 먼저 만든 것. 다시 읽어 만들어진
    // 지갑을 반환 — 두 번째 지급은 없다.
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
 * 감사 체크: wallet.balance 는 같은 사용자의 SUM(transactions.delta) 와
 * 같아야 한다. 이 파일의 헬퍼를 거치지 않고 토큰을 바꾸면 어긋나며,
 * 바로 그 어긋남이 우리가 잡고 싶은 신호다.
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
 * 읽기 전용 잔액 조회. 지갑이 아직 없으면 0 (가입 후엔 없을 일이 없지만
 * 안전하게).
 */
export async function getBalance(userId: string): Promise<number> {
  const w = await prisma.tokenWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return w?.balance ?? 0;
}
