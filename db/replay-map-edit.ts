// AI 지도 편집 재생 세트 — 실제 모델로 db/test-fixtures/map-agent-replay/edit-cases.json 을 N회 돌려 계획을 기대와 비교한다(실행은 안 함 — DB 지도 무변).
// 작업 규칙 9·10(--run 없으면 계획만). 실행: npx tsx db/replay-map-edit.ts [--n 3] [--case <이름 일부>] [--max-usd 1] [--run]
// 적중 = 확인 카드 문장이 기대와 순서까지 같음(되묻기·못 하는 일·빈 계획은 그 결과. alsoQuestion = 되묻기도 적중 — §6.3 "넣기 또는 되묻기"). 비용: 예상 합계가 --max-usd 를 넘으면 멈춤. 결과 = db/test-logs/map-edit-replay/(커밋 안 함).
// 기준(§6.9 — 3a 숫자를 그대로 씀): 적중률 0.8 이상 · 1회 $0.05 이하 · 거부 문항에서 계획이 나온 수 0. 비교 대상 = baseline-edit.json · --save-baseline = 통과하고 안 나빠지면 저장.

import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { sendMessage } from "../lib/ai";
import { prisma } from "../lib/db";
import { planMapEdit } from "../lib/map-edit";
import { planLine } from "../lib/map-edit-plan";
import type { MyLifeData } from "../lib/my-life";
import { MAP_EDIT_SYSTEM_PROMPT, MAP_EDIT_TOOLS } from "../lib/prompts/map-edit";
import { requireTestBudget, saveLiveFailure } from "./live-log";
import { requireRun } from "./run-guard";

type Case = { name: string; request: string; expectLines?: string[]; alsoQuestion?: boolean; expectQuestion?: boolean; expectUnsupported?: boolean; expectEmpty?: boolean };

const DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const LOG_DIR = path.join(__dirname, "test-logs", "map-edit-replay");
const EMAIL = "fixture-map-edit-replay@lifebook.invalid";
const EST_ROUNDS = 2.2; // 계획 출력용 — 쓰기 도구 1~2번 + answer
const EST_USD_PER_REQUEST = 0.008; // 계획 출력용(2026-11-07 실측 $0.0080)

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
    `예상 원가 약 $${(requests * EST_USD_PER_REQUEST).toFixed(2)}(요청당 약 $${EST_USD_PER_REQUEST}) · 예상 합계가 $${maxUsd} 를 넘으면 멈춤`,
    "DB 쓰기: 픽스처 계정 1개(끝나면 지움) · 원가 원장 TEST_MAP_EDIT 요청당 한 줄 · 지도 데이터는 가상 인물 파일만 · 계획만 만들고 실행 안 함",
  ]);
  await requireTestBudget("replay-map-edit");

  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const userId = (await prisma.user.create({ data: { email: EMAIL, name: "[fixture] 지도 편집 재생" }, select: { id: true } })).id;
  let right = 0;
  let total = 0;
  let cost = 0;
  let stopped = false;
  let refuseTotal = 0;
  let refuseBroken = 0; // 거부해야 할 문항(되묻기·못 하는 일·빈 계획)에서 계획이 나온 수
  // 화면에 보이는 모델 문장 = 되묻기뿐(카드 문장은 코드가 조립) — 3a 와 같은 방식으로 센다
  const seen = { sentences: 0, aliasSentences: 0, speakerWord: 0, internalWord: 0, formalEnding: 0, politeEnding: 0 };
  const runs: Record<string, unknown>[] = [];
  const perCase: Record<string, string> = {};
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
            ? JSON.stringify(lines) === JSON.stringify(c.expectLines) || (!!c.alsoQuestion && !!r.question && lines.length === 0)
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
        if (!c.expectLines) {
          refuseTotal += 1;
          if (lines.length > 0) refuseBroken += 1;
        }
        const t = r.ok ? r.question : null;
        if (t) {
          seen.sentences += 1;
          if (/\bn\d+\b/.test(t)) seen.aliasSentences += 1;
          if (t.includes("화자")) seen.speakerWord += 1;
          if (/노드|별칭|지도 목록|사용자/.test(t)) seen.internalWord += 1;
          if (/니다[.!]?$|니까\?$/.test(t)) seen.formalEnding += 1;
          else if (/요[.?]?$/.test(t)) seen.politeEnding += 1;
        }
        if (r.ok) cost += r.usage.costMicroUsd;
        const projected = cost + (cost / total) * (requests - total);
        if (total >= 10 && projected / 1e6 > maxUsd) { // 첫 호출은 캐시 쓰기로 비싸 앞 몇 번 평균은 합계를 부풀린다
          console.log(`멈춤 — 지금까지 $${(cost / 1e6).toFixed(4)}, 예상 합계 $${(projected / 1e6).toFixed(2)} > $${maxUsd}`);
          stopped = true;
          break outer;
        }
      }
      perCase[c.name] = `${caseRight}/${n}`;
      console.log(`${c.name}: ${caseRight}/${n}`);
    }
  } finally {
    await prisma.chatV3Usage.updateMany({ where: { userId }, data: { userId: null } });
    await deleteAccountTx(userId);
  }
  console.log(`\n적중 ${right}/${total} · 1회 $${(cost / Math.max(total, 1) / 1e6).toFixed(4)} · 합계 $${(cost / 1e6).toFixed(4)}`);
  console.log(`거부 문항 ${refuseTotal}번 중 계획이 나온 수 ${refuseBroken} · 되묻기 문장 ${seen.sentences} — 별칭 ${seen.aliasSentences} · 화자 ${seen.speakerWord} · 그 밖 내부 낱말 ${seen.internalWord} · -니다 ${seen.formalEnding} · -요 ${seen.politeEnding}`);
  const metrics = { requests: total, accuracy: right / Math.max(total, 1), refuseTotal, refuseBroken, usdPerRequest: cost / Math.max(total, 1) / 1e6, usdTotal: cost / 1e6, visibleText: seen };
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ right, total, usdTotal: cost / 1e6, metrics, perCase, runs }, null, 1));
  console.log(`결과 전부: ${path.relative(process.cwd(), logFile)}`);
  const passed = metrics.accuracy >= 0.8 && metrics.usdPerRequest <= 0.05 && refuseBroken === 0;
  const baselineFile = path.join(DIR, "baseline-edit.json");
  const compareFile = arg("compare-to", baselineFile);
  const ref = fs.existsSync(compareFile) ? (JSON.parse(fs.readFileSync(compareFile, "utf8")) as { metrics: typeof metrics }).metrics : null;
  const notWorse = !ref || (metrics.accuracy >= ref.accuracy && refuseBroken <= ref.refuseBroken);
  console.log(`기준 ${passed ? "통과" : "미달"}${ref ? ` · 비교(${path.basename(compareFile)}): 적중률 ${ref.accuracy.toFixed(3)} → ${metrics.accuracy.toFixed(3)} · 거부 위반 ${ref.refuseBroken} → ${refuseBroken} · 1회 $${ref.usdPerRequest.toFixed(4)} → $${metrics.usdPerRequest.toFixed(4)}` : ""}`);
  if (process.argv.includes("--save-baseline") && passed && notWorse && !stopped && cases.length === all.length) {
    const promptHash = createHash("sha256").update(MAP_EDIT_SYSTEM_PROMPT + JSON.stringify(MAP_EDIT_TOOLS)).digest("hex").slice(0, 16);
    fs.writeFileSync(baselineFile, `${JSON.stringify({ at: new Date().toISOString(), model: "claude-sonnet-4-6", n, promptHash, metrics, perCase }, null, 2)}\n`);
    console.log("기준 통과·안 나빠짐 — baseline-edit.json 저장");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
