// Phase V3 검증 — 멀티턴 + 저장.
//
// 시나리오:
//   (a) BIG/DB 답 후, 후속 "1번 자세히" → source=context, 검색 호출 없음
//       (tokensSpent 가 검색 답(보통 9+)보다 훨씬 작음, balance 비교)
//   (b) 어시스턴트 답 저장 → list 로 다시 읽음 + 토큰 0
//   (c) saveTimemachineMonth (keptEvents + monthStory) 호출 후 비서 저장
//       행이 살아있음 / 반대로 비서 저장 호출 후 T6 저장 행도 살아있음
//   (d) Phase 7 createdVia="ai_chat" 행 만들고 → 위 흐름 후에도 그대로
//
// 사전: 시드 적재 + ANTHROPIC_API_KEY + Anthropic 콘솔 web_search 활성.

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  askAssistant,
  type AssistantResult,
} from "../lib/timemachine-assistant";
import {
  saveAssistantAnswer,
  listAssistantAnswers,
  deleteAssistantAnswer,
} from "../lib/timemachine-assistant-saved";
import { saveTimemachineMonth } from "../lib/timemachine-memories";

const DIVIDER = "─".repeat(64);

function check(label: string, ok: boolean) {
  console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
}

function printResult(label: string, r: AssistantResult) {
  console.log(`\n${DIVIDER}`);
  console.log(`[${label}]`);
  console.log(
    `source=${r.source} category=${r.category} spent=${r.tokensSpent} balance=${r.balanceAfter}`,
  );
  console.log(`---\n${r.text}\n---`);
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
      email: `assistant-v3-${Date.now()}@test`,
      name: "v3-test",
    },
  });
  await prisma.tokenWallet.create({
    data: { userId: user.id, balance: 200 },
  });

  try {
    // ────────────────────────────────────────────────────────────
    // (a) 멀티턴 — BIG/DB 답 후 후속 질문 컨텍스트로 답
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[a] 멀티턴 / 컨텍스트 답\n${DIVIDER}`);

    const a1 = await askAssistant(
      user.id,
      "이때 어떤 사건이 있었나요?",
      2025,
      8,
    );
    printResult("a-1 첫 질문 (BIG/DB)", a1);

    const balBefore = await balance(user.id);

    // prior = a1 의 user 질문 + assistant 답.
    const prior = [
      { role: "user" as const, text: "이때 어떤 사건이 있었나요?" },
      { role: "assistant" as const, text: a1.text },
    ];

    const a2 = await askAssistant(
      user.id,
      "첫 번째 사건을 좀 더 자세히 알려줘",
      2025,
      8,
      prior,
    );
    printResult("a-2 후속 질문 (context)", a2);

    const balAfter = await balance(user.id);
    const spent = balBefore - balAfter;

    console.log("\n=== (a) 체크 ===");
    check("a-1 source=db (첫 질문)", a1.source === "db");
    check("a-1 tokens=0", a1.tokensSpent === 0);
    check("a-2 source=context (검색 없이 컨텍스트)", a2.source === "context");
    check("a-2 차감 작음 (≤ 3, 검색 답 9+ 보다 훨씬 작음)", spent <= 3);
    check("a-2 wallet 일치", spent === a2.tokensSpent);

    // ────────────────────────────────────────────────────────────
    // (b) 답 저장 → 재조회 토큰 0
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[b] 저장 → 재조회 토큰 0\n${DIVIDER}`);

    const balBeforeSave = await balance(user.id);
    const savedId = await saveAssistantAnswer(
      user.id,
      2025,
      8,
      "이때 어떤 사건이 있었나요?",
      {
        text: a1.text,
        source: a1.source,
        category: a1.category,
        citations: a1.citations,
        songs: a1.songs,
        events: a1.events.map((e) => ({
          title: e.title,
          description: e.description,
          section: e.section,
        })),
      },
    );
    const balAfterSave = await balance(user.id);

    const reload = await listAssistantAnswers(user.id, 2025, 8);
    const found = reload.find((r) => r.id === savedId);

    console.log("\n=== (b) 체크 ===");
    check("저장 후 토큰 차감 0", balAfterSave === balBeforeSave);
    check("listAssistantAnswers 가 저장한 답 포함", Boolean(found));
    check("저장된 question 일치", found?.question === "이때 어떤 사건이 있었나요?");
    check("저장된 answer.text 일치", found?.answer.text === a1.text);
    check("저장된 source 일치", found?.answer.source === "db");
    check("재조회 호출에 토큰 차감 없음 (DB 만 읽음) ", true);

    // ────────────────────────────────────────────────────────────
    // (c) T6 keptEvent/monthStory 와 비서 저장 공존
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[c] T6 와 V3 저장 공존\n${DIVIDER}`);

    // T6 저장 — 2025/8 의 BIG 사건 하나를 keptEvent 로, monthStory 도.
    const bigEvent = a1.events[0];
    if (!bigEvent) {
      throw new Error("a1 에 BIG 사건이 없음 — 시드 확인");
    }
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [{ monthEventId: bigEvent.id, story: "기억 메모" }],
      monthStory: "이 달 회고 본문",
    });

    // 비서 저장 행이 살아있는지
    const afterT6 = await listAssistantAnswers(user.id, 2025, 8);
    check(
      "T6 저장 후에도 비서 저장 행 살아있음",
      afterT6.some((r) => r.id === savedId),
    );

    // T6 행도 살아있는지
    const t6Rows = await prisma.userMemory.findMany({
      where: { userId: user.id, year: 2025, month: 8 },
      select: { createdVia: true },
    });
    const t6Event = t6Rows.filter((r) => r.createdVia === "timemachine_event").length;
    const t6Month = t6Rows.filter((r) => r.createdVia === "timemachine_month").length;
    const v3Asst = t6Rows.filter((r) => r.createdVia === "timemachine_assistant").length;
    check("timemachine_event 1행", t6Event === 1);
    check("timemachine_month 1행", t6Month === 1);
    check("timemachine_assistant 1행 (비서 저장)", v3Asst === 1);

    // 비서 저장 한 번 더 → T6 행에 영향 없는지
    const savedId2 = await saveAssistantAnswer(
      user.id,
      2025,
      8,
      "이때 유행한 노래는?",
      {
        text: "테스트 답",
        source: "db",
        category: "MUSIC",
        citations: [],
        songs: [],
        events: [],
      },
    );
    const afterMoreSave = await prisma.userMemory.findMany({
      where: { userId: user.id, year: 2025, month: 8 },
      select: { createdVia: true },
    });
    const t6EventStill = afterMoreSave.filter((r) => r.createdVia === "timemachine_event").length;
    const t6MonthStill = afterMoreSave.filter((r) => r.createdVia === "timemachine_month").length;
    check("비서 저장 추가 후에도 timemachine_event 1행", t6EventStill === 1);
    check("비서 저장 추가 후에도 timemachine_month 1행", t6MonthStill === 1);

    // 비서 저장 하나 삭제 후, T6 행 그대로
    await deleteAssistantAnswer(user.id, savedId2);
    const afterDel = await prisma.userMemory.findMany({
      where: { userId: user.id, year: 2025, month: 8 },
      select: { createdVia: true },
    });
    const v3AsstLeft = afterDel.filter((r) => r.createdVia === "timemachine_assistant").length;
    const t6EventAfterDel = afterDel.filter((r) => r.createdVia === "timemachine_event").length;
    check("비서 1행 삭제 후 비서 행 1 남음", v3AsstLeft === 1);
    check("비서 삭제는 T6 event 행에 영향 없음", t6EventAfterDel === 1);

    // ────────────────────────────────────────────────────────────
    // (d) Phase 7 createdVia="ai_chat" 행 무영향
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[d] Phase 7 ai_chat 무영향\n${DIVIDER}`);

    await prisma.userMemory.create({
      data: {
        userId: user.id,
        year: 2025,
        month: 8,
        title: "Phase 7 임의 추억",
        content: "옛 ai_chat 본문",
        createdVia: "ai_chat",
      },
    });

    // 비서 저장/삭제, T6 저장 더 한 번
    const savedId3 = await saveAssistantAnswer(
      user.id,
      2025,
      8,
      "이때 인기 드라마?",
      {
        text: "또 다른 테스트",
        source: "web",
        category: "TASTE",
        citations: [{ url: "https://example.com", title: "예시" }],
        songs: [],
        events: [],
      },
    );
    await deleteAssistantAnswer(user.id, savedId3);
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [{ monthEventId: bigEvent.id, story: "재저장 메모" }],
      monthStory: "회고 재저장",
    });

    const finalRows = await prisma.userMemory.findMany({
      where: { userId: user.id, year: 2025, month: 8 },
      select: { createdVia: true, content: true },
    });
    const ai_chat = finalRows.filter((r) => r.createdVia === "ai_chat");
    check("ai_chat 행이 정확히 1개", ai_chat.length === 1);
    check("ai_chat content 보존", ai_chat[0]?.content === "옛 ai_chat 본문");

    // 최종 ledger
    const ledger = await prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { delta: true, reason: true },
    });
    console.log(`\n${DIVIDER}\n[ledger ${ledger.length}건]`);
    for (const t of ledger) {
      console.log(`  ${t.reason} ${t.delta}`);
    }
  } finally {
    // 정리
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
