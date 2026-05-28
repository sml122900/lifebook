// Phase 8.3 race-safety 점검 (검토 후 픽스).
//
// 같은 대화에 settleConversationCharges 두 개를 병렬로 쏜다. 픽스 전엔
// 두 트랜잭션이 같은 미정산 행을 SELECT 해 같은 비용을 계산하고 지갑을
// 이중 차감할 수 있었다. 픽스 후:
//   - 원자적 UPDATE ... RETURNING 이 행 잠금 하에 선점 → 패배자는 0행을
//     보고 no_usage 로 빠짐.
//   - 조건부 wallet UPDATE (WHERE balance >= cost) 가 chargedAt 선점이
//     혹시 미끄러져도 음수 잔액을 막는다.
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
