// Phase 8.3 race-safety check (post-review fix).
//
// Two settleConversationCharges calls fire IN PARALLEL on the same
// conversation. Before the fix, both transactions could SELECT the
// same unsettled rows, compute the same cost, and double-decrement
// the wallet. After the fix:
//   - Atomic UPDATE ... RETURNING claims rows under row lock so the
//     loser sees 0 rows and bails with no_usage.
//   - Conditional wallet UPDATE (WHERE balance >= cost) prevents
//     negative balance even if the chargedAt claim somehow slips.
//
// Expected:
//   - exactly one outcome has charged=true with tokensSpent=1
//   - the other has charged=false reason=no_usage
//   - wallet decremented by exactly 1
//   - balance ↔ ledger reconcile match
//
// Run with: npx tsx db/test-charge-race.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { settleConversationCharges } from "../lib/tokens/charge";
import { SIGNUP_GRANT_TOKENS } from "../lib/tokens/policy";
import {
  ensureWalletWithSignupGrant,
  reconcileBalance,
} from "../lib/tokens/wallet";

async function main() {
  const email = `race-test-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: { email },
    select: { id: true },
  });

  try {
    await ensureWalletWithSignupGrant(user.id);
    const event = await prisma.event.findFirst({
      where: { category: "trigger", domain: "music" },
      select: { id: true },
    });
    if (!event) throw new Error("no trigger event in DB");

    const conv = await prisma.aIConversation.create({
      data: {
        userId: user.id,
        eventId: event.id,
        messages: {
          create: [
            {
              role: "assistant",
              content: "1. ... 2. ... 3. ...",
              inputTokens: 700,
              outputTokens: 150,
            },
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

    console.log("— firing two settle calls in parallel");
    const [r1, r2] = await Promise.all([
      settleConversationCharges(user.id, conv.id),
      settleConversationCharges(user.id, conv.id),
    ]);
    console.log("  r1:", r1);
    console.log("  r2:", r2);

    const rec = await reconcileBalance(user.id);
    console.log(
      `  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`,
    );

    const chargedResults = [r1, r2].filter((r) => r.charged);
    const skippedResults = [r1, r2].filter((r) => !r.charged);

    const failures: string[] = [];
    if (chargedResults.length !== 1)
      failures.push(`expected exactly 1 charged result, got ${chargedResults.length}`);
    if (skippedResults.length !== 1)
      failures.push(`expected exactly 1 skipped result, got ${skippedResults.length}`);
    const winner = chargedResults[0];
    if (winner && winner.charged && winner.tokensSpent !== 1)
      failures.push(`winner should cost 1 token, got ${winner.tokensSpent}`);
    if (rec.walletBalance !== SIGNUP_GRANT_TOKENS - 1)
      failures.push(
        `wallet should be ${SIGNUP_GRANT_TOKENS - 1}, got ${rec.walletBalance}`,
      );
    if (!rec.match) failures.push("ledger ↔ wallet diverged");

    if (failures.length > 0) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: parallel settle resolves to exactly one charge.");
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
