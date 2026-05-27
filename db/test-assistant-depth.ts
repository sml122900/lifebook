// Phase V4 검증 — 답의 깊이 (Haiku/Sonnet/Opus).
//
// 시나리오:
//   (a) 세 깊이가 각각 다른 모델 호출 (ledger reason 으로 확인)
//   (b) 토큰이 깊이별로 다르게 차감 (Haiku 1x < Sonnet 3x < Opus 5x)
//   (c) DB 답은 깊이와 무관하게 무료 (BIG 사건 시드 있는 달에 세 깊이로)
//   (d) 후속 컨텍스트 답도 깊이를 이어감 (자기 차감 비율 비교)
//
// 사전: 시드 적재 + ANTHROPIC_API_KEY + 콘솔 web_search 활성 + Sonnet/Opus
//       모델 접근 권한 (Anthropic console).

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  askAssistant,
  type AssistantDepth,
  type AssistantResult,
} from "../lib/timemachine-assistant";

const DIVIDER = "─".repeat(64);

function check(label: string, ok: boolean) {
  console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
}

function printResult(label: string, r: AssistantResult) {
  console.log(`\n${DIVIDER}\n[${label}]`);
  console.log(
    `depth=${r.depth} source=${r.source} category=${r.category} spent=${r.tokensSpent} balance=${r.balanceAfter}`,
  );
  console.log(`---\n${r.text.slice(0, 200)}${r.text.length > 200 ? "…" : ""}\n---`);
}

async function balance(userId: string): Promise<number> {
  const w = await prisma.tokenWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return w?.balance ?? 0;
}

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `assistant-depth-${Date.now()}@test`,
      name: "depth-test",
    },
  });
  await prisma.tokenWallet.create({
    data: { userId: user.id, balance: 500 }, // Sonnet/Opus 가 비싸 넉넉히
  });

  try {
    // ────────────────────────────────────────────────────────────
    // (c) DB 답은 깊이와 무관하게 무료
    // 2025/8 BIG 사건 시드 있음 (한미·한일 정상회담)
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[c] DB 답 (BIG) — 깊이와 무관 무료\n${DIVIDER}`);
    const balC0 = await balance(user.id);
    const depths: AssistantDepth[] = ["simple", "detailed", "precise"];
    const dbResults: AssistantResult[] = [];
    for (const d of depths) {
      const r = await askAssistant(
        user.id,
        "이때 어떤 사건이 있었나요?",
        2025,
        8,
        [],
        d,
      );
      printResult(`(c) BIG/DB depth=${d}`, r);
      dbResults.push(r);
    }
    const balC1 = await balance(user.id);
    console.log("\n=== (c) 체크 ===");
    check("3건 모두 source=db", dbResults.every((r) => r.source === "db"));
    check("3건 모두 tokensSpent=0", dbResults.every((r) => r.tokensSpent === 0));
    check("3건 모두 depth echo 정확", dbResults.every((r, i) => r.depth === depths[i]));
    check("wallet 변동 없음", balC0 === balC1);

    // ────────────────────────────────────────────────────────────
    // (a)(b) 세 깊이 검색 답 — 모델 분기 + 비례 차감
    // 1995/5 BIG miss → web 폴백 경로 (각 깊이마다 검색 1회)
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[a][b] 검색 답 깊이별 차감 비교\n${DIVIDER}`);
    const searchSpent: Partial<Record<AssistantDepth, number>> = {};
    for (const d of depths) {
      const bal0 = await balance(user.id);
      const r = await askAssistant(
        user.id,
        "이때 큰 사건은 무엇이 있었나요?",
        1995,
        5,
        [],
        d,
      );
      printResult(`(a/b) 검색 depth=${d}`, r);
      const bal1 = await balance(user.id);
      searchSpent[d] = bal0 - bal1;
      check(`depth=${d}: wallet 차감 일치`, bal0 - bal1 === r.tokensSpent);
      check(`depth=${d}: depth echo`, r.depth === d);
    }
    const sSimple = searchSpent.simple ?? 0;
    const sDetailed = searchSpent.detailed ?? 0;
    const sPrecise = searchSpent.precise ?? 0;
    console.log(
      `\n>> 검색 차감 비교: simple=${sSimple} detailed=${sDetailed} precise=${sPrecise}`,
    );
    console.log("\n=== (b) 체크 ===");
    // 비율 기준 — multiplier 는 정확히 1:3:5 지만 검색 input 토큰이
    // 비결정적 (검색 결과량 변동) 이라 실측 비율은 ±20% 변동.
    check("detailed > simple (≥ 2배)", sDetailed >= sSimple * 2);
    check("precise > detailed (≥ 1.2배)", sPrecise >= sDetailed * 1.2);
    check("precise > simple (≥ 4배)", sPrecise >= sSimple * 4);

    // ledger 에서 모델 분기 확인 (a)
    console.log("\n=== (a) ledger 분기 확인 ===");
    const ledger = await prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { delta: true, reason: true },
    });
    const reasonsSet = new Set(ledger.map((l) => l.reason));
    check(
      "ledger 에 _simple 등장",
      [...reasonsSet].some((r) => r.includes("_simple")),
    );
    check(
      "ledger 에 _detailed 등장",
      [...reasonsSet].some((r) => r.includes("_detailed")),
    );
    check(
      "ledger 에 _precise 등장",
      [...reasonsSet].some((r) => r.includes("_precise")),
    );

    // ────────────────────────────────────────────────────────────
    // (d) 후속 컨텍스트 답도 깊이 이어감
    // 2025/8 BIG/DB 첫 답 → 후속 "1번 자세히" 를 simple/precise 로 비교
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[d] 컨텍스트 답 깊이 이어감\n${DIVIDER}`);
    const first = await askAssistant(
      user.id,
      "이때 어떤 사건이 있었나요?",
      2025,
      8,
      [],
      "simple",
    );
    const prior = [
      { role: "user" as const, text: "이때 어떤 사건이 있었나요?" },
      { role: "assistant" as const, text: first.text },
    ];

    const ctxSpent: Partial<Record<AssistantDepth, number>> = {};
    for (const d of (["simple", "precise"] as const)) {
      const bal0 = await balance(user.id);
      const r = await askAssistant(
        user.id,
        "첫 번째 사건을 좀 더 자세히 알려줘",
        2025,
        8,
        prior,
        d,
      );
      printResult(`(d) context depth=${d}`, r);
      const bal1 = await balance(user.id);
      ctxSpent[d] = bal0 - bal1;
      check(`depth=${d}: depth echo`, r.depth === d);
    }
    const cSimple = ctxSpent.simple ?? 0;
    const cPrecise = ctxSpent.precise ?? 0;
    console.log(`\n>> 컨텍스트 차감: simple=${cSimple} precise=${cPrecise}`);
    check(
      "context precise > simple (멀티플라이어 적용)",
      cPrecise > cSimple,
    );

    // 최종 ledger 요약
    const ledger2 = await prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { delta: true, reason: true },
    });
    console.log(`\n${DIVIDER}\n[ledger ${ledger2.length}건]`);
    for (const t of ledger2) {
      console.log(`  ${t.reason} ${t.delta}`);
    }
  } finally {
    await prisma.userMemory.deleteMany({ where: { userId: user.id } });
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
