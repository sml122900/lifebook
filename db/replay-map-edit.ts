// AI 지도 편집 재생 세트 — 실제 모델로 db/test-fixtures/map-agent-replay/edit-cases.json 을 N회 돌려 계획을 기대와 비교한다(실행은 안 함 — DB 지도 무변).
// 작업 규칙 9·10(--run 없으면 계획만). 실행: npx tsx db/replay-map-edit.ts [--n 3] [--case <이름 일부>] [--max-usd 1] [--run]
// 적중 = 확인 카드 문장이 기대와 순서까지 같음(되묻기·못 하는 일·빈 계획은 그 결과). 비용: 예상 합계가 --max-usd 를 넘으면 멈춤. 결과 = db/test-logs/map-edit-replay/(커밋 안 함).

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { sendMessage } from "../lib/ai";
import { prisma } from "../lib/db";
import { planMapEdit } from "../lib/map-edit";
import { planLine } from "../lib/map-edit-plan";
import type { MyLifeData } from "../lib/my-life";
import { requireTestBudget, saveLiveFailure } from "./live-log";
import { requireRun } from "./run-guard";

type Case = { name: string; request: string; expectLines?: string[]; expectQuestion?: boolean; expectUnsupported?: boolean; expectEmpty?: boolean };

const DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const LOG_DIR = path.join(__dirname, "test-logs", "map-edit-replay");
const EMAIL = "fixture-map-edit-replay@lifebook.invalid";
const EST_ROUNDS = 2.2; // 계획 출력용 — 쓰기 도구 1~2번 + answer
const EST_USD_PER_REQUEST = 0.015; // 계획 출력용 추정(3a 실측 $0.0039 보다 도구가 많고 라운드가 길다 — 위쪽 값, 실측 전)

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const persona = JSON.parse(fs.readFileSync(path.join(DIR, "persona.json"), "utf8")) as MyLifeData;
  const all = (JSON.parse(fs.readFileSync(path.join(DIR, "edit-cases.json"), "utf8")) as { cases: Case[] }).cases;
  const cases = all.filter((c) => c.name.includes(arg("case", "")));
  const n = Number(arg("n", "3"));
  const maxUsd = Number(arg("max-usd", "1"));
  const requests = cases.length * n;
  requireRun([
    `요청 ${cases.length}개 × ${n}회 = ${requests}번 · 모델 호출 약 ${Math.ceil(requests * EST_ROUNDS)}회(Sonnet 4.6 고정)`,
    `예상 원가 약 $${(requests * EST_USD_PER_REQUEST).toFixed(2)}(요청당 약 $${EST_USD_PER_REQUEST} — 실측 전 추정) · 예상 합계가 $${maxUsd} 를 넘으면 멈춤`,
    "DB 쓰기: 픽스처 계정 1개(끝나면 지움) · 원가 원장 TEST_MAP_EDIT 요청당 한 줄 · 지도 데이터는 가상 인물 파일만 · 계획만 만들고 실행 안 함",
  ]);
  await requireTestBudget("replay-map-edit");

  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const userId = (await prisma.user.create({ data: { email: EMAIL, name: "[fixture] 지도 편집 재생" }, select: { id: true } })).id;
  let right = 0;
  let total = 0;
  let cost = 0;
  const runs: Record<string, unknown>[] = [];
  try {
    outer: for (const c of cases) {
      let caseRight = 0;
      for (let i = 0; i < n; i++) {
        total += 1;
        const startedAt = Date.now();
        const r = await planMapEdit(userId, c.request, { callModel: sendMessage, data: persona, dailyLimit: Infinity });
        const ms = Date.now() - startedAt;
        const lines = r.ok ? r.plan.map((p) => planLine(p, "will")) : [];
        const pass =
          r.ok &&
          (c.expectLines
            ? JSON.stringify(lines) === JSON.stringify(c.expectLines)
            : c.expectQuestion
              ? !!r.question && lines.length === 0
              : c.expectUnsupported
                ? r.unsupported && lines.length === 0
                : lines.length === 0);
        if (pass) {
          right += 1;
          caseRight += 1;
        } else {
          saveLiveFailure("replay-map-edit", c.name, { request: c.request, result: r, lines });
        }
        runs.push({ case: c.name, i, ms, pass, lines, result: r.ok ? { question: r.question, unsupported: r.unsupported, usage: r.usage } : r });
        if (r.ok) cost += r.usage.costMicroUsd;
        const projected = cost + (cost / total) * (requests - total);
        if (total >= 3 && projected / 1e6 > maxUsd) {
          console.log(`멈춤 — 지금까지 $${(cost / 1e6).toFixed(4)}, 예상 합계 $${(projected / 1e6).toFixed(2)} > $${maxUsd}`);
          break outer;
        }
      }
      console.log(`${c.name}: ${caseRight}/${n}`);
    }
  } finally {
    await prisma.chatV3Usage.updateMany({ where: { userId }, data: { userId: null } });
    await deleteAccountTx(userId);
  }
  console.log(`\n적중 ${right}/${total} · 1회 $${(cost / Math.max(total, 1) / 1e6).toFixed(4)} · 합계 $${(cost / 1e6).toFixed(4)}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ right, total, usdTotal: cost / 1e6, runs }, null, 1));
  console.log(`결과 전부: ${path.relative(process.cwd(), logFile)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
