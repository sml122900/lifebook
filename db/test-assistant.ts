// Phase V1 검증 — 타임머신 AI 비서 백엔드.
//
// 네 케이스:
//   (a) BIG 이벤트 질문 → DB 답 + 차감 0
//   (b) MUSIC 질문 → DB 답 + 차감 0
//   (c) TASTE 질문 → 웹 검색 답 + 가드 톤 + 출처 + 차감 발생
//   (d) BIG 질문이지만 DB 에 자료 없는 달 → 검색 폴백
//
// 사전 조건:
//   - 시드 적재 끝: db/seed-timemachine.ts (2025.6 ~ 2026.5)
//   - ANTHROPIC_API_KEY 환경변수 설정
//   - Anthropic 콘솔에서 web_search 도구 활성화 (없으면 c, d 가 502 류)

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  askAssistant,
  type AssistantResult,
} from "../lib/timemachine-assistant";

const DIVIDER = "─".repeat(64);

function printResult(label: string, r: AssistantResult) {
  console.log(`\n${DIVIDER}`);
  console.log(`[${label}]`);
  console.log(`source=${r.source} category=${r.category} spent=${r.tokensSpent} balance=${r.balanceAfter}`);
  console.log(`---\n${r.text}\n---`);
  if (r.citations.length > 0) {
    console.log("citations:");
    for (const c of r.citations) {
      console.log(`  - ${c.title} :: ${c.url}`);
    }
  }
}

function check(label: string, ok: boolean) {
  console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
}

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `assistant-${Date.now()}@test`,
      name: "assistant-test",
    },
  });
  await prisma.tokenWallet.create({
    data: { userId: user.id, balance: 200 },
  });

  try {
    // ────────────────────────────────────────────────────────────
    // (a) BIG → DB
    // 2025년 8월: 한미·한일 정상회담 등 POLITICS_SOCIETY 시드 있음.
    // ────────────────────────────────────────────────────────────
    const balA0 = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id }, select: { balance: true },
    }))!.balance;

    const a = await askAssistant(
      user.id,
      "이때 어떤 사건이 있었나요?",
      2025, 8,
    );
    printResult("(a) BIG → DB", a);

    const balA1 = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id }, select: { balance: true },
    }))!.balance;

    console.log("\n=== (a) 체크 ===");
    check("source = db", a.source === "db");
    check("category = BIG", a.category === "BIG");
    check("text 비어있지 않음", a.text.length > 0);
    check("차감 0", a.tokensSpent === 0);
    check("wallet 변동 없음", balA0 === balA1);

    // ────────────────────────────────────────────────────────────
    // (b) MUSIC → DB
    // 2026년 4월: ChartSong DOMESTIC 1~10위 시드 있음.
    // ────────────────────────────────────────────────────────────
    const balB0 = balA1;

    const b = await askAssistant(
      user.id,
      "이때 유행한 노래는 뭐가 있어요?",
      2026, 4,
    );
    printResult("(b) MUSIC → DB", b);

    const balB1 = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id }, select: { balance: true },
    }))!.balance;

    console.log("\n=== (b) 체크 ===");
    check("source = db", b.source === "db");
    check("category = MUSIC", b.category === "MUSIC");
    check("text 비어있지 않음", b.text.length > 0);
    check("차감 0", b.tokensSpent === 0);
    check("wallet 변동 없음", balB0 === balB1);

    // ────────────────────────────────────────────────────────────
    // (c) TASTE → web (drama)
    // ────────────────────────────────────────────────────────────
    const balC0 = balB1;
    let c: AssistantResult | null = null;
    try {
      c = await askAssistant(
        user.id,
        "이때 인기 드라마나 영화는 뭐였나요?",
        2025, 8,
      );
      printResult("(c) TASTE → web", c);

      const balC1 = (await prisma.tokenWallet.findUnique({
        where: { userId: user.id }, select: { balance: true },
      }))!.balance;

      console.log("\n=== (c) 체크 ===");
      check("source = web", c.source === "web");
      check("category = TASTE", c.category === "TASTE");
      check("text 비어있지 않음", c.text.length > 0);
      check("차감 발생 (≥ 1)", c.tokensSpent >= 1);
      check("wallet 정확히 감소", balC1 === balC0 - c.tokensSpent);
      check(
        "조심스러운 톤 (것 같/확인/추정/었던/모릅)",
        /것\s*같|확인|추정|었던|모릅|아마|보였/.test(c.text),
      );
      check("출처 있음 (citations ≥ 1)", c.citations.length >= 1);
    } catch (e) {
      console.log("\n=== (c) 검증 실패 — web_search 비활성 가능 ===");
      console.log(e instanceof Error ? e.message : String(e));
      console.log("Anthropic 콘솔에서 'Web search' 도구 활성화 필요.");
    }

    // ────────────────────────────────────────────────────────────
    // (d) BIG 이지만 DB 비어있는 달 → web 폴백
    // 1900년 1월: 시드 없음.
    // ────────────────────────────────────────────────────────────
    const balD0 = (await prisma.tokenWallet.findUnique({
      where: { userId: user.id }, select: { balance: true },
    }))!.balance;

    try {
      const d = await askAssistant(
        user.id,
        "이때 큰 사건은 무엇이 있었나요?",
        1995, 5,
      );
      printResult("(d) BIG miss → web 폴백", d);

      const balD1 = (await prisma.tokenWallet.findUnique({
        where: { userId: user.id }, select: { balance: true },
      }))!.balance;

      console.log("\n=== (d) 체크 ===");
      check("category = BIG", d.category === "BIG");
      check("source = web (폴백)", d.source === "web");
      check("text 비어있지 않음", d.text.length > 0);
      check("차감 발생", d.tokensSpent >= 1);
      check("wallet 정확히 감소", balD1 === balD0 - d.tokensSpent);
    } catch (e) {
      console.log("\n=== (d) 검증 실패 — web_search 비활성 가능 ===");
      console.log(e instanceof Error ? e.message : String(e));
    }

    // 마지막으로 ledger 요약.
    const ledger = await prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { delta: true, reason: true, refId: true },
    });
    console.log(`\n${DIVIDER}`);
    console.log(`[ledger ${ledger.length}건]`);
    for (const t of ledger) {
      console.log(`  ${t.reason} ${t.delta}`);
    }
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
