// Phase 8.3 — settle outstanding AI usage against the user's wallet.
//
// Policy choice: charge by memory CYCLE, not by individual API call.
// One cycle = the guided-questions call + (eventually) the summary
// call. We sum their tokens, run tokensFromUsage() once, and write a
// single TokenTransaction. Charging per call would ceil() twice and
// double-bill (1+1 instead of 1) for the very common ~1,113-token
// cycle the policy is calibrated to.
//
// Race safety (post-review):
//   1. AIMessage rows are claimed atomically with
//        UPDATE ... SET chargedAt = NOW() WHERE chargedAt IS NULL
//      under PostgreSQL's row-level lock + condition re-check (READ
//      COMMITTED). A concurrent settle sees 0 rows and bails out.
//   2. Wallet decrement is conditional —
//        UPDATE ... SET balance = balance - cost WHERE balance >= cost
//      so two parallel charges can never push the balance negative.
//      If the condition fails we throw InsufficientBalance and the
//      surrounding $transaction rolls the chargedAt claims back too.
//
// Both checks are INSIDE the same $transaction so balance ↔ ledger
// never diverges and a race loser leaves no half-applied state.

import { prisma } from "../db";
import { InsufficientBalanceError } from "./errors";
import { tokensFromUsage } from "./policy";

export type ChargeOutcome =
  | { charged: false; reason: "no_usage" }
  | {
      charged: true;
      tokensSpent: number;
      balanceAfter: number;
      transactionId: string;
    };

type ClaimedRow = {
  id: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

type WalletRow = { balance: number };

/**
 * Settle every unsettled AIMessage in a conversation against the
 * wallet. Safe to call multiple times — if there's nothing new to
 * charge, returns { charged: false }.
 *
 * Concurrent callers (e.g. double-submit, network retry): one settle
 * claims the unsettled rows, the other gets a no-op. Wallet can never
 * go negative even if two charges race past the upstream gate.
 */
export async function settleConversationCharges(
  userId: string,
  conversationId: string,
  refId?: string,
): Promise<ChargeOutcome> {
  return await prisma.$transaction(async (tx) => {
    // Defense-in-depth: conversation must belong to this user. The
    // action layer already checks this, but keep the helper safe.
    const conv = await tx.aIConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conv || conv.userId !== userId) {
      throw new Error("conversation does not belong to user");
    }

    // Atomically claim unsettled assistant messages. The WHERE-clause
    // is re-evaluated under row lock, so two concurrent settles can't
    // both claim the same row — the loser gets an empty result and
    // bails out with no_usage.
    const claimed = await tx.$queryRaw<ClaimedRow[]>`
      UPDATE "AIMessage"
      SET "chargedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
        AND role = 'assistant'::"AIMessageRole"
        AND "chargedAt" IS NULL
      RETURNING id, "inputTokens", "outputTokens"
    `;

    if (claimed.length === 0) {
      return { charged: false, reason: "no_usage" } as const;
    }

    const totalIn = claimed.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0);
    const totalOut = claimed.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0);
    const cost = tokensFromUsage(totalIn, totalOut);

    if (cost === 0) {
      // Defensive: tokensFromUsage only returns 0 when totals are 0,
      // which should have been caught upstream (AIMessage not stored
      // when usage was 0). chargedAt is already set on the claimed
      // rows so the next pass won't re-evaluate them.
      return { charged: false, reason: "no_usage" } as const;
    }

    // Conditional wallet decrement. If balance < cost (concurrent
    // race past the upstream MIN_BALANCE gate), RETURNING is empty
    // and we throw — the $transaction rolls the chargedAt claims back
    // so the messages are eligible for the next, properly-funded
    // settle attempt.
    const walletUpdated = await tx.$queryRaw<WalletRow[]>`
      UPDATE "TokenWallet"
      SET balance = balance - ${cost}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND balance >= ${cost}
      RETURNING balance
    `;

    if (walletUpdated.length === 0) {
      throw new InsufficientBalanceError();
    }

    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        delta: -cost,
        reason: "ai_charge",
        refId: refId ?? conversationId,
      },
      select: { id: true },
    });

    return {
      charged: true,
      tokensSpent: cost,
      balanceAfter: walletUpdated[0].balance,
      transactionId: transaction.id,
    } as const;
  });
}

// Phase T4 — 일회성 AI 호출(예: 음성 다듬기) 후 차감.
//
// settleConversationCharges 가 대화 단위 합산을 위해 AIMessage 의
// chargedAt 을 사용하는 반면, 일회성 호출은 한 번의 in/out 토큰만
// 다루므로 conversation 우회. 락 패턴은 동일:
//   - WHERE balance >= cost 조건부 UPDATE → race 시 잔액 음수 차단
//   - 트랜잭션 내부에서 wallet 갱신 + ledger 기록 한 묶음
//
// reason 예: "voice_cleanup". refId 는 추적 보조 (생략 가능).
// surcharge: AI 토큰 외 운영 비용 가산 (예: web_search 1회당 1토큰).
//   cost = tokensFromUsage(in,out) + surcharge. surcharge 가 0 보다 크면
//   in/out 이 0 이어도 차감이 발생한다.
export async function chargeOneShot(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  reason: string,
  refId?: string,
  surcharge: number = 0,
): Promise<{ tokensSpent: number; balanceAfter: number; transactionId: string | null }> {
  const cost = tokensFromUsage(inputTokens, outputTokens) + surcharge;

  if (cost === 0) {
    const w = await prisma.tokenWallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return { tokensSpent: 0, balanceAfter: w?.balance ?? 0, transactionId: null };
  }

  return await prisma.$transaction(async (tx) => {
    const walletUpdated = await tx.$queryRaw<WalletRow[]>`
      UPDATE "TokenWallet"
      SET balance = balance - ${cost}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND balance >= ${cost}
      RETURNING balance
    `;
    if (walletUpdated.length === 0) {
      throw new InsufficientBalanceError();
    }
    const transaction = await tx.tokenTransaction.create({
      data: { userId, delta: -cost, reason, refId },
      select: { id: true },
    });
    return {
      tokensSpent: cost,
      balanceAfter: walletUpdated[0].balance,
      transactionId: transaction.id,
    };
  });
}
