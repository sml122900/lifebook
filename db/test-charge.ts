// Phase 8.3 점검.
//
// 일회용 사용자로 검증:
//   1. 한 사이클 분량 AI 사용(가이드+요약 합산)이 호출당이 아니라
//      "한 번에 1토큰" 차감되는지.
//   2. 새 AIMessage 없이 settle 재호출 시 no-op (= 7.5 의 "대화 재사용" 케이스).
//   3. wallet.balance 가 SUM(transactions.delta) 와 계속 일치하는지.
//
// 실행: npx tsx db/test-charge.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { settleConversationCharges } from "../lib/tokens/charge";
import { SIGNUP_GRANT_TOKENS } from "../lib/tokens/policy";
import {
  ensureWalletWithSignupGrant,
  reconcileBalance,
} from "../lib/tokens/wallet";

async function main() {
  const email = `charge-test-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: { email },
    select: { id: true, email: true },
  });
  console.log(`created throwaway user ${user.email}`);

  try {
    await ensureWalletWithSignupGrant(user.id);

    // Borrow an existing trigger event so we don't have to insert one.
    const event = await prisma.event.findFirst({
      where: { category: "trigger", domain: "music" },
      select: { id: true },
    });
    if (!event) throw new Error("no trigger event found");

    const conv = await prisma.aIConversation.create({
      data: {
        userId: user.id,
        eventId: event.id,
        messages: {
          create: [
            // Realistic guided-questions usage.
            {
              role: "assistant",
              content: "1. ... 2. ... 3. ...",
              inputTokens: 700,
              outputTokens: 150,
            },
            // Realistic summary usage queued in the same cycle.
            {
              role: "assistant",
              content: "추억 한 줄",
              inputTokens: 350,
              outputTokens: 30,
            },
          ],
        },
      },
      select: { id: true },
    });

    console.log("\n— step 1: settle one full cycle (guided + summary together)");
    const c1 = await settleConversationCharges(user.id, conv.id);
    console.log(c1);
    let rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    console.log("\n— step 2: re-settle with no new AI calls (page revisit)");
    const c2 = await settleConversationCharges(user.id, conv.id);
    console.log(c2);
    rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    console.log("\n— step 3: add another assistant message and settle");
    await prisma.aIMessage.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: "또 한 줄",
        inputTokens: 600,
        outputTokens: 120,
      },
    });
    const c3 = await settleConversationCharges(user.id, conv.id);
    console.log(c3);
    rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    const failures: string[] = [];
    if (!c1.charged || c1.tokensSpent !== 1) failures.push("step 1 cycle should cost exactly 1 token");
    if (c1.charged && c1.balanceAfter !== SIGNUP_GRANT_TOKENS - 1) failures.push("balance should be grant - 1");
    if (c2.charged) failures.push("step 2 must be a no-op");
    if (!c3.charged || c3.tokensSpent !== 1) failures.push("step 3 should cost 1");
    if (!rec.match) failures.push("balance must equal transaction sum");

    if (failures.length > 0) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: cycle billing + revisit no-op + ledger invariant all hold.");
    }
  } finally {
    // Cascade-delete via the user cleans everything up.
    await prisma.user.delete({ where: { id: user.id } });
    console.log("cleaned up");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
