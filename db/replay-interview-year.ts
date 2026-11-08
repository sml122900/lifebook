// 오늘의 인터뷰 연도 해석 재생 세트 — db/test-fixtures/interview-year-replay/cases.json 의 답을 모델별로 N회 다시 돌려
// 기대 연도 적중률을 낸다(CLAUDE.md 작업 규칙 9 — 모델·프롬프트를 바꾸면 전후 각 10회 비교). 2026-11-08: Sonnet 4.6 → Haiku 4.5 비교.
//
// 실행: npx tsx db/replay-interview-year.ts [--models sonnet,haiku] [--n 10] [--max-usd 1] [--run]
//   --run 이 없으면 비교 계획(사례 수·모델·호출 수·예상 원가·오늘 테스트 원가)만 출력하고 끝(호출 0 — 작업 규칙 10).
// 호출 = 앱과 같은 함수(lib/interview/year parseYearWithAi — 모델만 바꿈). 사례는 정규식이 못 푸는 답만(AI 경로) — 시작 때 확인.
// 판정 = 반환 연도 === expectYear(null 기대는 null 일 때만 적중). 원가 = 호출마다 토큰 × 단가(lib/chat-v3-usage costMicroUsd),
// --max-usd(기본 $1)를 넘기 전에 멈춘다. 원장은 픽스처 계정(fixture-year-replay@lifebook.invalid)으로 TEST_INTERVIEW_YEAR,
// 끝에 계정을 지운다(원장은 남음). test30·운영 계정 접촉 0.

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { newAiUsage, trackAiUsage, withUsageLedger } from "../lib/ai";
import { modelId } from "../lib/ai-model";
import { costMicroUsd, testBudgetMicroUsd, testSpentTodayMicroUsd } from "../lib/chat-v3-usage";
import { prisma } from "../lib/db";
import { isUnknownYearAnswer, parseYearDeterministic, parseYearWithAi } from "../lib/interview/year";
import { requireTestBudget } from "./live-log";
import { requireRun } from "./run-guard";

type Case = { id: string; birthYear: number | null; answer: string; expectYear: number | null };
const FILE = path.join(__dirname, "test-fixtures", "interview-year-replay", "cases.json");
const FIXTURE_EMAIL = "fixture-year-replay@lifebook.invalid";
const CONCURRENCY = 5;
// 계획 출력용 1회 예상 원가(지시문 약 330토큰 + 답 + 출력 약 10토큰).
const EST_USD: Record<string, number> = { sonnet: 0.0012, haiku: 0.0004 };

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function resolveModel(m: string): { key: string; id: string } {
  if (m === "sonnet" || m === "haiku") return { key: m, id: modelId(m) };
  return { key: m, id: m };
}

async function main() {
  const spec = JSON.parse(fs.readFileSync(FILE, "utf8")) as { now: string; cases: Case[] };
  const now = new Date(spec.now);
  const models = arg("models", "sonnet,haiku").split(",").filter(Boolean).map(resolveModel);
  const n = Number(arg("n", "10"));
  const maxMicro = Math.floor(Number(arg("max-usd", "1")) * 1e6);
  // 사례가 정말 AI 경로를 타는지 — 정규식이 풀거나 "모르겠어요"류면 앱은 AI 를 안 부른다.
  const notAi = spec.cases.filter((c) => parseYearDeterministic(c.answer, c.birthYear, now) !== null || isUnknownYearAnswer(c.answer));
  const calls = spec.cases.length * models.length * n;
  const est = models.reduce((s, m) => s + (EST_USD[m.key] ?? 0.0012) * spec.cases.length * n, 0);
  requireRun([
    `재생 세트 ${spec.cases.length}건(기준일 ${spec.now.slice(0, 10)}) · AI 경로 아님 ${notAi.length}건${notAi.length ? `: ${notAi.map((c) => c.id).join(", ")}` : ""}`,
    `모델 ${models.map((m) => `${m.key}(${m.id})`).join(", ")} × ${n}회 = 호출 ${calls}회 · 예상 원가 약 $${est.toFixed(2)} · 상한 $${(maxMicro / 1e6).toFixed(2)}`,
    `오늘 테스트 원가 $${((await testSpentTodayMicroUsd()) / 1e6).toFixed(4)} / 한도 $${(testBudgetMicroUsd() / 1e6).toFixed(2)} · DB 쓰기 = 픽스처 계정 1개(끝에 삭제) + 원장 ${calls}줄`,
  ]);
  if (notAi.length) throw new Error(`AI 경로가 아닌 사례: ${notAi.map((c) => c.id).join(", ")}`);
  await requireTestBudget("replay-interview-year");

  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
  const userId = (await prisma.user.create({ data: { email: FIXTURE_EMAIL, name: "[fixture] year replay" }, select: { id: true } })).id;

  let spent = 0;
  let stopped = false;
  const report: Record<string, { calls: number; micro: number; hits: number; perCase: Record<string, { hit: number; got: Record<string, number> }> }> = {};
  try {
    for (const m of models) {
      const r = (report[m.key] = { calls: 0, micro: 0, hits: 0, perCase: {} as Record<string, { hit: number; got: Record<string, number> }> });
      const jobs = spec.cases.flatMap((c) => Array.from({ length: n }, () => c));
      let next = 0;
      const worker = async () => {
        while (next < jobs.length && !stopped) {
          // 상한 — 이 모델의 1회 예상 원가 3배 여유를 두고 넘기 전에 멈춘다.
          if (spent + (EST_USD[m.key] ?? 0.0012) * 3e6 > maxMicro) {
            stopped = true;
            break;
          }
          const c = jobs[next++];
          const usage = newAiUsage();
          const got = await trackAiUsage(usage, () =>
            withUsageLedger(userId, "INTERVIEW_YEAR", () => parseYearWithAi(c.answer, c.birthYear, now, m.id)),
          );
          const micro = usage.model ? costMicroUsd(usage.model, usage.inputTokens, usage.outputTokens) : 0;
          spent += micro;
          r.micro += micro;
          r.calls += usage.calls;
          const pc = (r.perCase[c.id] ??= { hit: 0, got: {} });
          const key = got === null ? "null" : String(got);
          pc.got[key] = (pc.got[key] ?? 0) + 1;
          if (got === c.expectYear) {
            pc.hit += 1;
            r.hits += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (stopped) break;
    }
  } finally {
    await deleteAccountTx(userId).catch(() => {});
  }

  const total = spec.cases.length * n;
  console.log(`\n=== 연도 해석 재생 — 사례 ${spec.cases.length}건 × ${n}회${stopped ? " (상한에 걸려 중간에 멈춤)" : ""} ===`);
  for (const m of models) {
    const r = report[m.key];
    if (!r) continue;
    console.log(`\n[${m.key} — ${m.id}] 적중 ${r.hits}/${total} = ${(r.hits / total).toFixed(3)} · 호출 ${r.calls} · 원가 $${(r.micro / 1e6).toFixed(4)} · 1회 $${(r.micro / 1e6 / Math.max(1, r.calls)).toFixed(5)}`);
    for (const c of spec.cases) {
      const pc = r.perCase[c.id];
      if (!pc || pc.hit === n) continue;
      console.log(`  ✗ ${c.id} — ${pc.hit}/${n} · 기대 ${c.expectYear ?? "null"} · 받은 값 ${Object.entries(pc.got).map(([k, v]) => `${k}×${v}`).join(", ")}`);
    }
  }
  // 회귀 판정(사용자 규칙): 기준(첫 모델)이 9/10 이상 맞힌 사례를 다른 모델이 그 밑으로 떨어뜨리면 = 새 실패.
  if (models.length >= 2) {
    const [base, ...rest] = models;
    for (const m of rest) {
      const b = report[base.key], o = report[m.key];
      if (!b || !o) continue;
      const regress = spec.cases.filter((c) => (b.perCase[c.id]?.hit ?? 0) >= Math.ceil(n * 0.9) && (o.perCase[c.id]?.hit ?? 0) < Math.ceil(n * 0.9)).map((c) => c.id);
      console.log(`\n판정 ${m.key} vs ${base.key}: 적중 ${o.hits} vs ${b.hits} · 새 실패(기준 ≥${Math.ceil(n * 0.9)}/${n} → 미만) ${regress.length ? regress.join(", ") : "없음"}`);
    }
  }
  console.log(`\n총 원가 $${(spent / 1e6).toFixed(4)} · 정리 — 픽스처 계정 ${await prisma.user.count({ where: { email: FIXTURE_EMAIL } })}`);
  fs.writeFileSync(
    path.join(__dirname, "test-fixtures", "interview-year-replay", "last-run.json"),
    JSON.stringify({ at: new Date().toISOString(), n, stopped, spentUsd: spent / 1e6, report }, null, 2) + "\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
