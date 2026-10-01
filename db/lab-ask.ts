// 기억 에이전트 R2-2 — 질의응답 에이전트 수동 실행(로컬). 연구실 화면(R2-3)과 같은 runAgent().
//
// 대상은 LAB_ALLOWED_USER_IDS 허용 목록만. 답 본문·근거 카드는 가상 페르소나(lab_persona_*)일
// 때만 출력하고, 운영자 본인 계정은 라운드·비용·주장 통계만 출력한다. 실행마다 LabAgentRun 1행
// (source=UI)이 남는다. 골든셋 문항은 여기서 돌리지 않는다(평가는 db/lab-eval.ts --mode answer).
//
// 실행: npx tsx db/lab-ask.ts --user <userId> --q "질문" [--q "질문2" …]

import "dotenv/config";

import { prisma } from "../lib/db";
import { runAgent } from "../lib/lab/agent";
import { isLabUser, LAB_PERSONA_PREFIX } from "../lib/lab/gate";

function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

async function main() {
  const userId = args("--user")[0];
  const questions = args("--q");
  if (!userId || questions.length === 0)
    throw new Error('--user <userId> --q "질문" 필요');
  if (!isLabUser(userId))
    throw new Error("허용 목록(LAB_ALLOWED_USER_IDS)에 없는 대상 — 중단");
  const isPersona = userId.startsWith(LAB_PERSONA_PREFIX);

  let cost = 0;
  let rounds = 0;
  let submitted = 0;
  let dropped = 0;
  for (const q of questions) {
    const r = await runAgent(userId, q, { source: "UI" });
    cost += r.costMicroUsd;
    rounds += r.rounds;
    submitted += r.answer.stats.submittedClaims;
    dropped += r.answer.stats.droppedClaims;
    const s = r.answer.stats;
    console.log(`\nQ. ${isPersona ? q : "(운영자 계정 — 질문·답 미출력)"}`);
    if (isPersona) {
      console.log(`A. ${r.answer.text}`);
      const cards = await prisma.memoryCard.findMany({
        where: { id: { in: r.answer.citations.map((c) => c.cardId) } },
        select: { id: true, sourceType: true, summary: true },
      });
      for (const c of r.answer.citations) {
        const card = cards.find((x) => x.id === c.cardId);
        console.log(
          `   [${c.n}] ${card ? `${card.sourceType} — ${card.summary}` : "(카드 없음)"}`,
        );
      }
    }
    console.log(
      `   라운드 ${r.rounds} · 도구 ${r.toolTrace.map((t) => t.tool).join("→")} · 주장 ${s.submittedClaims}(버림 ${s.droppedClaims}, 가짜 근거 ${s.droppedCitations}) · $${(r.costMicroUsd / 1e6).toFixed(4)}${r.error ? ` · 오류 ${r.error}` : ""}`,
    );
  }
  const n = questions.length;
  console.log(
    `\n합계 ${n}문항 · 질문당 평균 $${(cost / n / 1e6).toFixed(4)} · 평균 ${(rounds / n).toFixed(1)}라운드 · 근거 없는 주장 ${dropped}/${submitted}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
