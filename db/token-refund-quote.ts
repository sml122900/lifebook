// 토큰 충전 환불 금액 보기(2026-11-10 — 읽기만, 쓰기 0 · 결제 호출 0). 계산 = lib/tokens/refund(원장을 다시 따라가 무료 → 유료 순).
//
//   npx tsx db/token-refund-quote.ts --email <이메일>   그 계정의 충전 건별 남은 토큰·환불 금액
//   npx tsx db/token-refund-quote.ts --all              모든 지갑: 무료 + 유료 남은 토큰 = 잔액인지(원장으로 계산이 되는지) 점검
//
// 실제 환불(토스 결제 취소 + 원장 차감)은 아직 코드 없음 — 이 금액을 보고 운영자가 처리.

import "dotenv/config";

import { prisma } from "../lib/db";
import { quoteTopupRefunds } from "../lib/tokens/refund";

const args = process.argv.slice(2);
const email = args.includes("--email") ? args[args.indexOf("--email") + 1] : null;
const all = args.includes("--all");

async function quoteFor(userId: string) {
  const [ledger, orders, wallet] = await Promise.all([
    prisma.tokenTransaction.findMany({ where: { userId }, select: { id: true, delta: true, reason: true, refId: true, createdAt: true } }),
    prisma.tokenOrder.findMany({ where: { userId, status: "paid" }, select: { id: true, krw: true, tokens: true, approvedAt: true } }),
    prisma.tokenWallet.findUnique({ where: { userId }, select: { balance: true } }),
  ]);
  return { ...quoteTopupRefunds(ledger, orders), balance: wallet?.balance ?? 0 };
}

async function main() {
  if (email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) throw new Error(`계정 없음: ${email}`);
    const q = await quoteFor(u.id);
    console.log(`잔액 ${q.balance} = 무료 ${q.free} + 유료 ${q.paid}${q.free + q.paid === q.balance ? "" : "  ⚠ 합이 잔액과 다름"}`);
    for (const x of q.quotes) {
      console.log(
        `- 충전 ${x.orderId} · ${x.krw.toLocaleString()}원 ${x.tokens}토큰 · 결제 ${x.paidAt.toISOString()} · 남은 ${x.remaining} · ` +
          `${x.unused ? "안 씀" : "씀"} · ${x.within7Days ? "7일 안" : "7일 지남"} → 환불 ${x.refundKrw.toLocaleString()}원`,
      );
    }
  } else if (all) {
    const wallets = await prisma.tokenWallet.findMany({ select: { userId: true } });
    let bad = 0;
    let paidWallets = 0;
    for (const w of wallets) {
      const q = await quoteFor(w.userId);
      if (q.free + q.paid !== q.balance || q.free < 0 || q.paid < 0) bad += 1;
      if (q.quotes.length > 0) paidWallets += 1;
    }
    console.log(`지갑 ${wallets.length} · 충전한 지갑 ${paidWallets} · 무료 + 유료 ≠ 잔액 ${bad}`);
    if (bad) process.exitCode = 1;
  } else {
    console.log("--email <이메일> 또는 --all");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
