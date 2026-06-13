// Phase 8.5 점검 — settleOrderAfterToss:
//   1. 정상 경로는 패키지 토큰만큼 정확히 적립
//   2. 같은 paymentKey 재실행은 no-op (idempotent)
//   3. 금액 불일치는 절대 적립 안 하고 주문을 FAILED 로 전환
//   4. 내내 ledger 합계 = wallet 잔액 유지
//
// 실행: npx tsx db/test-topup-settle.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { createPendingOrder, settleOrderAfterToss } from "../lib/tokens/orders";
import { reconcileBalance } from "../lib/tokens/wallet";

async function main() {
  const email = `topup-test-${Date.now()}@example.invalid`;
  const user = await prisma.user.create({
    data: { email },
    select: { id: true },
  });

  try {
    // No signup grant for this throwaway — easier to read the numbers.
    await prisma.tokenWallet.create({
      data: { userId: user.id, balance: 0 },
    });

    // 매 실행 고유 paymentKey — paymentKey 는 전역 @unique 라 고정 문자열을
    // 쓰면, throwaway user 를 지워도 SetNull 로 남은 이전 TokenOrder 행과
    // 재실행 시 P2002 로 충돌한다. user.id(cuid)로 실행마다 유일하게.
    const pk1 = `pk-${user.id}-1`;
    const pk2 = `pk-${user.id}-2`;
    const pk4 = `pk-${user.id}-4`;

    console.log("\n— step 1: happy path");
    const order1 = await createPendingOrder(user.id, "starter");
    console.log(`  created order ${order1.orderId} (${order1.krw}원 → ${order1.tokens}토큰)`);
    const s1 = await settleOrderAfterToss(user.id, order1.orderId, pk1, order1.krw);
    console.log(`  settle:`, s1);
    let rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    console.log("\n— step 2: same paymentKey twice (idempotency)");
    const s2 = await settleOrderAfterToss(user.id, order1.orderId, pk1, order1.krw);
    console.log(`  settle:`, s2);
    rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    console.log("\n— step 3: amount mismatch (Toss reports half)");
    const order2 = await createPendingOrder(user.id, "starter");
    const s3 = await settleOrderAfterToss(user.id, order2.orderId, pk2, 500);
    console.log(`  settle:`, s3);
    const o2 = await prisma.tokenOrder.findUnique({ where: { id: order2.orderId } });
    console.log(`  order status=${o2?.status} failReason=${o2?.failReason}`);
    rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    console.log("\n— step 4: bonus package credits total (value 3,000원 → 330토큰)");
    const order4 = await createPendingOrder(user.id, "value");
    console.log(`  created order ${order4.orderId} (${order4.krw}원 → ${order4.tokens}토큰)`);
    const s4 = await settleOrderAfterToss(user.id, order4.orderId, pk4, order4.krw);
    console.log(`  settle:`, s4);
    rec = await reconcileBalance(user.id);
    console.log(`  reconcile: wallet=${rec.walletBalance} txSum=${rec.transactionSum} match=${rec.match}`);

    const failures: string[] = [];
    if (!s1.ok || s1.tokensCredited !== 100 || s1.balanceAfter !== 100) failures.push("happy path didn't credit 100");
    if (!s2.ok || !s2.alreadySettled || s2.balanceAfter !== 100) failures.push("idempotency broken (re-credited)");
    if (s3.ok) failures.push("amount mismatch wasn't rejected");
    if (o2?.status !== "failed") failures.push("mismatched order should be FAILED");
    // step 4 — 보너스 패키지: krw=3000 결제로 총 330토큰(기본 300 + 보너스 30) 적립.
    if (order4.tokens !== 330) failures.push("value package tokens should be 330 (300+30 bonus)");
    if (!s4.ok || s4.tokensCredited !== 330 || s4.balanceAfter !== 430) failures.push("bonus package didn't credit 330 (balance 100→430)");
    if (!rec.match) failures.push("ledger ↔ wallet diverged");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: settle is idempotent, mismatch is rejected, ledger stays consistent.");
    }
  } finally {
    // orphan 방지 — TokenOrder.userId 는 SetNull 이라 user 삭제만으론 행이
    // 남는다(paymentKey 가 전역 @unique 라 다음 실행과 충돌). 먼저 정리.
    await prisma.tokenOrder.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
