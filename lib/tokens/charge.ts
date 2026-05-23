// Phase 8.3 — settle outstanding AI usage against the user's wallet.
//
// Policy choice: charge by memory CYCLE, not by individual API call.
// One cycle = the guided-questions call + (eventually) the summary
// call. We sum their tokens, run tokensFromUsage() once, and write a
// single TokenTransaction. Charging per call would ceil() twice and
// double-bill (1+1 instead of 1) for the very common ~1,113-token
// cycle the policy is calibrated to.
//
// Implementation: every AIMessage with chargedAt=NULL is an unsettled
// usage record. settleConversationCharges sums them, charges the
// wallet, flips chargedAt → now() for the same rows, all inside one
// $transaction so balance ↔ ledger never diverges.

import { prisma } from "../db";
import { tokensFromUsage } from "./policy";

export type ChargeOutcome =
  | { charged: false; reason: "no_usage" }
  | {
      charged: true;
      tokensSpent: number;
      balanceAfter: number;
      transactionId: string;
    };

/**
 * Settle every unsettled AIMessage in a conversation against the
 * wallet. Safe to call multiple times — if there's nothing new to
 * charge, returns { charged: false }.
 */
export async function settleConversationCharges(
  userId: string,
  conversationId: string,
  refId?: string,
): Promise<ChargeOutcome> {
  return await prisma.$transaction(async (tx) => {
    // Conversation must belong to this user. The action layer already
    // checks this, but treat this function as a defense-in-depth point.
    const conv = await tx.aIConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conv || conv.userId !== userId) {
      throw new Error("conversation does not belong to user");
    }

    const unsettled = await tx.aIMessage.findMany({
      where: {
        conversationId,
        chargedAt: null,
        role: "assistant",
      },
      select: { id: true, inputTokens: true, outputTokens: true },
    });

    if (unsettled.length === 0) {
      return { charged: false, reason: "no_usage" } as const;
    }

    const totalIn = unsettled.reduce(
      (sum, m) => sum + (m.inputTokens ?? 0),
      0,
    );
    const totalOut = unsettled.reduce(
      (sum, m) => sum + (m.outputTokens ?? 0),
      0,
    );
    const cost = tokensFromUsage(totalIn, totalOut);

    if (cost === 0) {
      // Mark settled so the next pass doesn't re-evaluate the same
      // free rows (defensive — tokensFromUsage only returns 0 when
      // total tokens is 0, but stay safe).
      await tx.aIMessage.updateMany({
        where: { id: { in: unsettled.map((m) => m.id) } },
        data: { chargedAt: new Date() },
      });
      return { charged: false, reason: "no_usage" } as const;
    }

    // Wallet + ledger together — never one without the other.
    const wallet = await tx.tokenWallet.update({
      where: { userId },
      data: { balance: { decrement: cost } },
      select: { balance: true },
    });
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        delta: -cost,
        reason: "ai_charge",
        refId: refId ?? conversationId,
      },
      select: { id: true },
    });
    await tx.aIMessage.updateMany({
      where: { id: { in: unsettled.map((m) => m.id) } },
      data: { chargedAt: new Date() },
    });

    return {
      charged: true,
      tokensSpent: cost,
      balanceAfter: wallet.balance,
      transactionId: transaction.id,
    } as const;
  });
}
