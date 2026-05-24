// Phase T4 검증 — voice cleanup + 토큰 차감 라운드트립.
// 실제 Anthropic 호출 1회 + chargeOneShot 까지 동작 확인.
//
// 확인 포인트:
//   - cleanupVoiceText 가 사실을 추가하지 않는 RAG 가드 작동
//   - 차감 후 wallet balance 가 정확히 감소
//   - TokenTransaction 에 voice_cleanup reason 으로 ledger 기록

import "dotenv/config";
import { prisma } from "../lib/db";
import { chargeOneShot } from "../lib/tokens/charge";
import { cleanupVoiceText } from "../lib/voice-cleanup";

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `voice-${Date.now()}@test`,
      name: "voice-test",
    },
  });
  await prisma.tokenWallet.create({
    data: { userId: user.id, balance: 50 },
  });

  try {
    const raw =
      "어 그 8월에 우리 가족이 강원도 갔는데 뭐 그 비가 너무 많이 와서 집에만 있었어요";
    console.log("[입력]");
    console.log(`  ${raw}`);

    const cleanup = await cleanupVoiceText(raw);
    console.log("\n[다듬은 결과]");
    console.log(`  ${cleanup.cleaned}`);
    console.log(`  in=${cleanup.inputTokens} out=${cleanup.outputTokens}`);

    const before = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id },
      select: { balance: true },
    }))!.balance;

    const charge = await chargeOneShot(
      user.id,
      cleanup.inputTokens,
      cleanup.outputTokens,
      "voice_cleanup",
    );

    const after = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id },
      select: { balance: true },
    }))!.balance;

    console.log("\n[차감]");
    console.log(`  before=${before} after=${after} spent=${charge.tokensSpent}`);

    const tx = await prisma.tokenTransaction.findMany({
      where: { userId: user.id, reason: "voice_cleanup" },
      select: { delta: true, reason: true },
    });
    console.log(`  ledger:`, tx);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    console.log("\n=== 체크 ===");
    check("다듬은 결과 비어있지 않음", cleanup.cleaned.length > 0);
    check("결과에 '강원도' 보존", cleanup.cleaned.includes("강원"));
    check(
      "결과에 '비' 보존",
      cleanup.cleaned.includes("비"),
    );
    check(
      "결과에서 군더더기('어','뭐') 제거",
      !cleanup.cleaned.match(/^어\s|\s어\s|\s뭐\s/),
    );
    check("토큰 차감액 ≥ 1", charge.tokensSpent >= 1);
    check(
      "wallet balance 정확히 감소",
      after === before - charge.tokensSpent,
    );
    check("ledger 1건 기록", tx.length === 1);
    check("ledger 음수 delta", tx[0]?.delta === -charge.tokensSpent);
  } finally {
    await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.tokenWallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
