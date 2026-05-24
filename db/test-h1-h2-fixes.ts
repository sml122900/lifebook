// 검토 후속 픽스 검증.
//
// H1: 시드 재실행 후에도 사용자의 timemachine_event 행 monthEventId 가
//     보존되어 loadTimemachineMonth 결과가 유지되는지.
// H2: AI 다듬기가 빈/동일 결과면 차감 안 되는지.

import "dotenv/config";
import { execSync } from "node:child_process";
import { prisma } from "../lib/db";
import {
  loadTimemachineMonth,
  saveTimemachineMonth,
} from "../lib/timemachine-memories";
import { chargeOneShot } from "../lib/tokens/charge";
import { cleanupVoiceText } from "../lib/voice-cleanup";

async function h1() {
  console.log("\n=== H1: 시드 재실행 시 추억 보존 ===");

  // 1) alice 가 2025-08 사건 1건 저장.
  const events = await prisma.monthEvent.findMany({
    where: { year: 2025, month: 8 },
    select: { id: true, title: true },
    take: 1,
  });
  if (events.length < 1) throw new Error("need at least 1 MonthEvent");
  const targetEvent = events[0];
  const beforeId = targetEvent.id;

  const alice = await prisma.user.create({
    data: { email: `h1-${Date.now()}@test`, name: "h1-alice" },
  });

  try {
    await saveTimemachineMonth(alice.id, 2025, 8, {
      keptEvents: [{ monthEventId: beforeId, story: "보존되어야 함" }],
      monthStory: "회고 본문",
    });
    const loadedBefore = await loadTimemachineMonth(alice.id, 2025, 8);

    // 2) 시드 재실행.
    console.log("  시드 재실행 중...");
    execSync("npx tsx db/seed-timemachine.ts", { stdio: "ignore" });

    // 3) 같은 사건 (section+year+month+title) 의 id 가 같은가?
    const sameRow = await prisma.monthEvent.findFirst({
      where: { title: targetEvent.title, year: 2025, month: 8 },
      select: { id: true },
    });
    const afterId = sameRow?.id;

    // 4) alice 의 저장 데이터는 그대로인가?
    const loadedAfter = await loadTimemachineMonth(alice.id, 2025, 8);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    check("MonthEvent id 가 시드 재실행 후에도 동일", beforeId === afterId);
    check(
      "loadTimemachineMonth keptEvents 1건 보존",
      loadedAfter.keptEvents.length === 1,
    );
    check(
      "keptEvents.monthEventId 동일",
      loadedAfter.keptEvents[0]?.monthEventId === beforeId,
    );
    check(
      "story 본문 보존",
      loadedAfter.keptEvents[0]?.story === "보존되어야 함",
    );
    check("월 회고 본문 보존", loadedAfter.monthStory === "회고 본문");
    check(
      "재실행 전후 load 결과 완전 일치",
      JSON.stringify(loadedBefore) === JSON.stringify(loadedAfter),
    );
  } finally {
    await prisma.user.delete({ where: { id: alice.id } });
  }
}

async function h2() {
  console.log("\n=== H2: 동일/빈 응답이면 차감 0 ===");

  const bob = await prisma.user.create({
    data: { email: `h2-${Date.now()}@test`, name: "h2-bob" },
  });
  await prisma.tokenWallet.create({
    data: { userId: bob.id, balance: 50 },
  });

  try {
    // 잘 정돈된 문장 — AI 가 같은 결과를 낼 가능성이 높음.
    const polished = "2025년 8월 광복 80주년을 맞아 가족과 함께 시간을 보냈다.";
    const r1 = await cleanupVoiceText(polished);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    // 결과가 원문과 동일하면 토큰 0.
    const normEq = polished.replace(/\s+/g, " ").trim() ===
      r1.cleaned.replace(/\s+/g, " ").trim();
    console.log(`  [정보] 입력 vs 결과 동일? ${normEq} (out=${r1.outputTokens})`);
    if (normEq) {
      check("동일 결과 → inputTokens 0", r1.inputTokens === 0);
      check("동일 결과 → outputTokens 0", r1.outputTokens === 0);
    } else {
      console.log("  [참고] AI 가 다른 결과를 냄. H2 분기 트리거 안 됨 — 빈 응답 시나리오로 대체 검증.");
    }

    // 빈 입력 → 빈 결과 → 토큰 0 (트림 빈 분기).
    const r2 = await cleanupVoiceText("   ");
    check("빈 입력 → tokens 0", r2.inputTokens === 0 && r2.outputTokens === 0);
    check("빈 입력 → cleaned ''", r2.cleaned === "");

    // chargeOneShot(0, 0) → 차감 안 되고 wallet 변동 없음.
    const before = (await prisma.tokenWallet.findUnique({
      where: { userId: bob.id }, select: { balance: true },
    }))!.balance;
    const charge = await chargeOneShot(bob.id, 0, 0, "voice_cleanup");
    const after = (await prisma.tokenWallet.findUnique({
      where: { userId: bob.id }, select: { balance: true },
    }))!.balance;
    const tx = await prisma.tokenTransaction.findMany({
      where: { userId: bob.id, reason: "voice_cleanup" },
    });

    check("chargeOneShot(0,0) → tokensSpent=0", charge.tokensSpent === 0);
    check("chargeOneShot(0,0) → balance 그대로", before === after);
    check("chargeOneShot(0,0) → ledger 기록 없음", tx.length === 0);
    check("chargeOneShot(0,0) → transactionId=null", charge.transactionId === null);
  } finally {
    await prisma.tokenTransaction.deleteMany({ where: { userId: bob.id } });
    await prisma.tokenWallet.deleteMany({ where: { userId: bob.id } });
    await prisma.user.delete({ where: { id: bob.id } });
  }
}

async function main() {
  await h1();
  await h2();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
