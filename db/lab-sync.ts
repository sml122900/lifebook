// 기억 에이전트 R1-7 — 대상 1명 동기화(로컬 대량 실행용). 연구실 화면 버튼과 같은 syncSubject().
//
// 대상은 LAB_ALLOWED_USER_IDS 허용 목록만. 출력 = 동기화 보고 + 이번 실행 원가(LabUsage)
// + 인용 부분문자열 일치율. 카드 샘플은 가상 페르소나(lab_persona_*)일 때만 출력한다 —
// 운영자 본인 계정의 카드 내용은 출력하지 않고 개수만.
//
// 실행: npx tsx db/lab-sync.ts --user <userId> [--max N] [--samples N]

import "dotenv/config";

import { prisma } from "../lib/db";
import { isLabUser, LAB_PERSONA_PREFIX } from "../lib/lab/gate";
import { syncSubject, verifyStoredQuotes } from "../lib/lab/sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const userId = arg("--user");
  if (!userId) throw new Error("--user <userId> 필요");
  if (!isLabUser(userId))
    throw new Error("허용 목록(LAB_ALLOWED_USER_IDS)에 없는 대상 — 중단");
  const max = arg("--max") ? Number(arg("--max")) : undefined;
  const samples = Number(arg("--samples") ?? 0);
  const isPersona = userId.startsWith(LAB_PERSONA_PREFIX);

  const t0 = Date.now();
  const report = await syncSubject(userId, { maxLlmUnits: max });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);

  const usage = await prisma.labUsage.groupBy({
    by: ["purpose", "model"],
    where: { refId: report.runId },
    _count: { _all: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      costMicroUsd: true,
    },
  });
  const costUsd =
    usage.reduce((s, u) => s + (u._sum.costMicroUsd ?? 0), 0) / 1e6;

  const [cards, units, quotes] = await Promise.all([
    prisma.memoryCard.groupBy({
      by: ["sourceType", "extractorModel"],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.memorySourceUnit.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    verifyStoredQuotes(userId),
  ]);

  console.log(`대상: ${isPersona ? userId : "(운영자 계정)"} · ${seconds}s`);
  console.log(
    "동기화 보고:",
    JSON.stringify({ ...report, errors: report.errors }, null, 2),
  );
  console.log(
    "이번 실행 원가:",
    usage.map((u) => ({
      purpose: u.purpose,
      model: u.model,
      calls: u._count._all,
      in: u._sum.inputTokens,
      out: u._sum.outputTokens,
      cacheRead: u._sum.cacheReadTokens,
      cacheWrite: u._sum.cacheWriteTokens,
      usd: ((u._sum.costMicroUsd ?? 0) / 1e6).toFixed(4),
    })),
    `합계 $${costUsd.toFixed(4)}`,
  );
  console.log(
    "원장 상태:",
    units.map((u) => `${u.status}=${u._count._all}`).join(", "),
  );
  console.log(
    "카드:",
    cards
      .map(
        (c) =>
          `${c.sourceType}/${c.extractorModel === "deterministic" ? "규칙" : "LLM"}=${c._count._all}`,
      )
      .join(", "),
  );
  const rate = quotes.llmCards === 0 ? 1 : quotes.llmVerbatim / quotes.llmCards;
  console.log(
    `인용 일치: LLM 카드 ${quotes.llmVerbatim}/${quotes.llmCards} (${(rate * 100).toFixed(1)}%) · 규칙 카드 ${quotes.deterministicVerbatim}/${quotes.deterministicCards}`,
  );

  if (samples > 0 && isPersona) {
    const people = await prisma.person.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const llmCards = await prisma.memoryCard.findMany({
      where: { userId, extractorModel: { not: "deterministic" } },
      orderBy: [
        { sourceType: "asc" },
        { createdAt: "asc" },
        { ordinal: "asc" },
      ],
      select: {
        sourceType: true,
        summary: true,
        quote: true,
        yearFrom: true,
        yearTo: true,
        timeBasis: true,
        timeExpression: true,
        personIds: true,
        personMentions: true,
      },
    });
    // 원본 유형이 고르게 섞이도록 유형별로 돌아가며 뽑는다.
    const byType = new Map<string, typeof llmCards>();
    for (const c of llmCards)
      byType.set(c.sourceType, [...(byType.get(c.sourceType) ?? []), c]);
    const picked: typeof llmCards = [];
    for (let round = 0; picked.length < samples && round < 10; round++) {
      for (const list of byType.values())
        if (list[round] && picked.length < samples) picked.push(list[round]);
    }
    console.log(`\n카드 샘플 ${picked.length}장(페르소나 A):`);
    for (const c of picked) {
      const when =
        c.yearFrom === null
          ? "시기 미상"
          : c.yearFrom === c.yearTo
            ? `${c.yearFrom}`
            : `${c.yearFrom}~${c.yearTo}`;
      console.log(
        `- [${c.sourceType}] ${c.summary}\n    인용: "${c.quote}"\n    시기: ${when} (${c.timeBasis}${c.timeExpression ? `, 표현 "${c.timeExpression}"` : ""}) · 인물: ${c.personIds.map((id) => nameOf.get(id) ?? "?").join(", ") || "-"} (호칭 ${c.personMentions.join(", ") || "-"})`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
