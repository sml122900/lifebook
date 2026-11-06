// 지도 질문 답하기 재생 세트 — 실제 모델로 db/test-fixtures/map-agent-replay 를 N회 돌려 3a 완료 기준(custom-graph §6.3)을 낸다.
// 작업 규칙 9(프롬프트 바꾸면 변경 전후 비교)·10(--run 없으면 계획만). 실행: npx tsx db/replay-map-agent.ts [--n 3] [--case <이름 일부>] [--max-usd 1] [--run]
// 기준: 정답률 ≥ 0.8 · 근거 정밀도 ≥ 0.9 · 근거 없는 주장 ≤ 5% · 1회 ≤ $0.05.
// 비용: 지금까지 평균으로 낸 예상 합계가 --max-usd 를 넘으면 멈춤. 결과 전부 = db/test-logs/map-replay/(커밋 안 함) · 전 문항 전체 실행이 기준을 넘으면 baseline.json(작업 규칙 9 의 변경 전 값).
// 원가는 픽스처 계정(fixture-map-replay@lifebook.invalid)으로 원장에 TEST_MAP_ASK 로 남고, 시작 때 테스트 한도(db/live-log)를 본다.

import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { sendMessage } from "../lib/ai";
import { prisma } from "../lib/db";
import { askMap } from "../lib/map-agent";
import type { MyLifeData } from "../lib/my-life";
import { MAP_AGENT_MODEL } from "../lib/map-agent";
import { MAP_AGENT_SYSTEM_PROMPT, MAP_AGENT_TOOLS } from "../lib/prompts/map-agent";
import { requireTestBudget, saveLiveFailure } from "./live-log";
import { requireRun } from "./run-guard";

type Case = { name: string; question: string; expectNodes?: string[]; expectNodeCount?: number; allowNodes?: string[]; forbidNodes?: string[]; forbidText?: string[]; expectNoRecord?: boolean; expectChange?: boolean };

const DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const LOG_DIR = path.join(__dirname, "test-logs", "map-replay");
const EMAIL = "fixture-map-replay@lifebook.invalid";
const EST_ROUNDS = 1.5; // 계획 출력용 — 목록으로 답하면 1라운드, read_node 를 거치면 2라운드
const EST_USD_PER_QUESTION = 0.02; // 계획 출력용 추정(첫 호출 캐시 쓰기 포함 위쪽 값, 실측 전)
const KIND: Record<string, string> = { event: "시기", story: "이야기", person: "사람", group: "모임", place: "장소", placeGroup: "장소 묶음", category: "카테고리", customGroup: "묶음", item: "항목" };

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const persona = JSON.parse(fs.readFileSync(path.join(DIR, "persona.json"), "utf8")) as MyLifeData;
  const all = (JSON.parse(fs.readFileSync(path.join(DIR, "cases.json"), "utf8")) as { cases: Case[] }).cases;
  const cases = all.filter((c) => c.name.includes(arg("case", "")));
  const n = Number(arg("n", "3"));
  const maxUsd = Number(arg("max-usd", "1"));
  const questions = cases.length * n;
  requireRun([
    `질문 ${cases.length}개 × ${n}회 = ${questions}번 · 모델 호출 약 ${Math.ceil(questions * EST_ROUNDS)}회(Sonnet 4.6 고정)`,
    `예상 원가 약 $${(questions * EST_USD_PER_QUESTION).toFixed(2)}(질문당 약 $${EST_USD_PER_QUESTION} — 실측 전 추정) · 예상 합계가 $${maxUsd} 를 넘으면 멈춤`,
    "DB 쓰기: 픽스처 계정 1개(끝나면 지움) · 원가 원장 TEST_MAP_ASK 질문당 한 줄 · 지도 데이터는 가상 인물 파일만",
  ]);
  await requireTestBudget("replay-map-agent");

  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (old) await deleteAccountTx(old.id);
  const userId = (await prisma.user.create({ data: { email: EMAIL, name: "[fixture] 지도 질문 재생" }, select: { id: true } })).id;
  let right = 0;
  let total = 0;
  let citedAll = 0;
  let citedGood = 0;
  let submitted = 0;
  let dropped = 0;
  let cost = 0;
  let stopped = false;
  // 기준 밖이지만 화면에 보이는 문장 — 프롬프트 비교용(화자·딱딱한 말투·지운 별칭)
  const seen = { sentences: 0, aliasSentences: 0, speakerWord: 0, formalEnding: 0, politeEnding: 0 };
  const runs: Record<string, unknown>[] = [];
  const perCase: Record<string, string> = {};
  try {
    outer: for (const c of cases) {
      let caseRight = 0;
      for (let i = 0; i < n; i++) {
        total += 1;
        const startedAt = Date.now();
        const r = await askMap(userId, c.question, { callModel: sendMessage, data: persona, dailyLimit: Infinity });
        const ms = Date.now() - startedAt;
        if (!r.ok) {
          runs.push({ case: c.name, i, ms, pass: false, reason: r.reason });
          saveLiveFailure("replay-map-agent", c.name, r);
          continue;
        }
        cost += r.stats.costMicroUsd;
        submitted += r.stats.submittedClaims;
        dropped += r.stats.droppedClaims;
        seen.aliasSentences += r.stats.aliasInText;
        for (const t of [...r.answer.claims.map((cl) => cl.text), r.answer.noRecord?.followUpQuestion ?? "", r.answer.noRecord?.topic ?? ""].filter(Boolean)) {
          seen.sentences += 1;
          if (t.includes("화자")) seen.speakerWord += 1;
          if (/(습니다|입니다|합니다)[.]?$/.test(t)) seen.formalEnding += 1;
          else if (/요[.?]?$/.test(t)) seen.politeEnding += 1;
        }
        const cited = r.answer.claims.flatMap((cl) => cl.nodes.map((x) => `${KIND[x.kind]}:${x.title}`));
        const allowed = new Set([...(c.expectNodes ?? []), ...(c.allowNodes ?? [])]);
        citedAll += cited.length;
        citedGood += cited.filter((x) => allowed.has(x)).length;
        const pass =
          (c.expectNodes ?? []).every((x) => cited.includes(x)) &&
          (c.expectNodeCount === undefined || cited.filter((x) => x === c.expectNodes![0]).length >= c.expectNodeCount) &&
          !(c.forbidNodes ?? []).some((x) => cited.includes(x)) &&
          (!c.expectNoRecord || !!r.answer.noRecord) &&
          (!c.expectChange || r.answer.asksChange) &&
          !(c.forbidText ?? []).some((w) => JSON.stringify(r.answer).includes(w));
        if (pass) {
          right += 1;
          caseRight += 1;
        } else {
          saveLiveFailure("replay-map-agent", c.name, r);
        }
        runs.push({ case: c.name, question: c.question, i, ms, pass, cited, offEvidence: cited.filter((x) => !allowed.has(x)), answer: r.answer, stats: r.stats });
        const projected = cost + (cost / total) * (questions - total);
        if (total >= 3 && projected / 1e6 > maxUsd) {
          console.log(`멈춤 — 지금까지 $${(cost / 1e6).toFixed(4)}, 예상 합계 $${(projected / 1e6).toFixed(2)} > $${maxUsd}`);
          stopped = true;
          perCase[c.name] = `${caseRight}/${i + 1}`;
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
  const pct = (a: number, b: number) => (b === 0 ? "—" : (a / b).toFixed(3));
  const usdPerQuestion = cost / Math.max(total, 1) / 1e6;
  console.log(`\n정답률 ${pct(right, total)}(기준 ≥ 0.8) · 근거 정밀도 ${pct(citedGood, citedAll)}(≥ 0.9) · 근거 없는 주장 ${pct(dropped, submitted)}(≤ 0.05) · 1회 $${usdPerQuestion.toFixed(4)}(≤ $0.05) · 합계 $${(cost / 1e6).toFixed(4)}`);
  const metrics = { questions: total, accuracy: right / Math.max(total, 1), evidencePrecision: citedAll ? citedGood / citedAll : null, unsupportedClaimRate: submitted ? dropped / submitted : 0, usdPerQuestion, usdTotal: cost / 1e6, visibleText: seen };
  console.log(`보이는 문장 ${seen.sentences} — 별칭 ${seen.aliasSentences} · 화자 ${seen.speakerWord} · -습니다 ${seen.formalEnding} · -요 ${seen.politeEnding}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${stamp}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ metrics, perCase, runs }, null, 1));
  console.log(`결과 전부: ${path.relative(process.cwd(), logFile)}`);
  const passed = metrics.accuracy >= 0.8 && (metrics.evidencePrecision ?? 0) >= 0.9 && metrics.unsupportedClaimRate <= 0.05 && usdPerQuestion <= 0.05;
  if (passed && !stopped && cases.length === all.length) {
    const promptHash = createHash("sha256").update(MAP_AGENT_SYSTEM_PROMPT + JSON.stringify(MAP_AGENT_TOOLS)).digest("hex").slice(0, 16);
    fs.writeFileSync(path.join(DIR, "baseline.json"), `${JSON.stringify({ at: new Date().toISOString(), model: MAP_AGENT_MODEL, n, promptHash, metrics, perCase }, null, 2)}\n`);
    console.log("기준 통과 — baseline.json 저장");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
