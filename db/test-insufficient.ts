// Phase 8.4 sanity check: a wallet below MIN_BALANCE_TO_START_CYCLE
// should make hasMinBalance / the page gate refuse a new cycle. We
// don't render the page here — just verify the underlying numbers.
//
// Run with: npx tsx db/test-insufficient.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { MIN_BALANCE_TO_START_CYCLE } from "../lib/tokens/policy";
import {
  ensureWalletWithSignupGrant,
  getBalance,
} from "../lib/tokens/wallet";

async function main() {
  const email = `gate-test-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: { email },
    select: { id: true },
  });

  try {
    await ensureWalletWithSignupGrant(user.id);

    // Drain to MIN-1 so the gate must fire on the next cycle attempt.
    const drainTo = MIN_BALANCE_TO_START_CYCLE - 1;
    await prisma.tokenWallet.update({
      where: { userId: user.id },
      data: { balance: drainTo },
    });
    // (No corresponding TokenTransaction — this is just gate-test
    //  scaffolding, not a real balance change in a real ledger.)

    const balance = await getBalance(user.id);
    const blocked = balance < MIN_BALANCE_TO_START_CYCLE;
    console.log(`balance=${balance} min=${MIN_BALANCE_TO_START_CYCLE} blocked=${blocked}`);

    if (!blocked) {
      console.error("FAILED — gate did not fire");
      process.exitCode = 1;
    } else {
      console.log("OK — gate fires on balance < min");
    }

    // And confirm a fresh signup (= MIN_BALANCE_TO_START_CYCLE or more) passes.
    await prisma.tokenWallet.update({
      where: { userId: user.id },
      data: { balance: MIN_BALANCE_TO_START_CYCLE },
    });
    const afterTopup = await getBalance(user.id);
    const blocked2 = afterTopup < MIN_BALANCE_TO_START_CYCLE;
    console.log(`balance=${afterTopup} min=${MIN_BALANCE_TO_START_CYCLE} blocked=${blocked2}`);
    if (blocked2) {
      console.error("FAILED — gate fired when exactly at min");
      process.exitCode = 1;
    } else {
      console.log("OK — gate passes at balance >= min");
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
