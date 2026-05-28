// Phase 8.2 점검: 가입 지급은 ensureWalletWithSignupGrant 를 몇 번
// 부르든 사용자당 정확히 한 번만 일어나야 한다. wallet.balance ↔
// 거래 합계 불변식도 함께 확인.
//
// 실사용자 지갑을 건드리지 않도록 일회용 User 행을 쓴다.
// 실행: npx tsx db/test-wallet-grant.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { SIGNUP_GRANT_TOKENS } from "../lib/tokens/policy";
import {
  ensureWalletWithSignupGrant,
  reconcileBalance,
} from "../lib/tokens/wallet";

async function main() {
  const email = `wallet-test-${Date.now()}@example.invalid`;
  const tempUser = await prisma.user.create({
    data: { email },
    select: { id: true, email: true },
  });
  console.log(`created throwaway user ${tempUser.email} (${tempUser.id})`);

  try {
    const w1 = await ensureWalletWithSignupGrant(tempUser.id);
    console.log(`1st call → balance=${w1.balance}`);

    const w2 = await ensureWalletWithSignupGrant(tempUser.id);
    console.log(`2nd call → balance=${w2.balance}  (must equal 1st — idempotent)`);

    const w3 = await ensureWalletWithSignupGrant(tempUser.id);
    console.log(`3rd call → balance=${w3.balance}`);

    const txs = await prisma.tokenTransaction.findMany({
      where: { userId: tempUser.id },
      orderBy: { createdAt: "asc" },
    });
    console.log(`transactions recorded: ${txs.length}`);
    for (const t of txs) {
      console.log(`  delta=${t.delta} reason=${t.reason}`);
    }

    const rec = await reconcileBalance(tempUser.id);
    console.log(
      `reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`,
    );

    const failures: string[] = [];
    if (w1.balance !== SIGNUP_GRANT_TOKENS) failures.push(`balance not ${SIGNUP_GRANT_TOKENS}`);
    if (w1.balance !== w2.balance || w2.balance !== w3.balance) failures.push("non-idempotent grant");
    if (txs.length !== 1) failures.push(`expected 1 transaction, got ${txs.length}`);
    if (!rec.match) failures.push("balance ≠ transaction sum");

    if (failures.length > 0) {
      console.error("\nFAILED:");
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nOK: signup grant fires once, balance matches transactions");
    }
  } finally {
    // Cascade-delete: removing the user clears wallet + transactions.
    await prisma.user.delete({ where: { id: tempUser.id } });
    console.log(`cleaned up ${tempUser.id}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
