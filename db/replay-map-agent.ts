// 지도 질문 답하기 재생 세트 — 실제 모델로 db/test-fixtures/map-agent-replay 를 N회 돌려 3a 완료 기준(custom-graph §6.3)을 낸다.
// 작업 규칙 9(프롬프트 바꾸면 변경 전후 비교)·10(--run 없으면 계획만). 실행: npx tsx db/replay-map-agent.ts [--n 3] [--case <이름 일부>] [--run]
// 기준: 정답률 ≥ 0.8 · 근거 정밀도 ≥ 0.9 · 근거 없는 주장 ≤ 5% · 1회 ≤ $0.05.
// 원가는 픽스처 계정(fixture-map-replay@lifebook.invalid)으로 원장에 TEST_MAP_ASK 로 남고, 시작 때 테스트 한도(db/live-log)를 본다.

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { sendMessage } from "../lib/ai";
import { prisma } from "../lib/db";
import { askMap } from "../lib/map-agent";
import type { MyLifeData } from "../lib/my-life";
import { requireTestBudget, saveLiveFailure } from "./live-log";
import { requireRun } from "./run-guard";

type Case = { name: string; question: string; expectNodes?: string[]; expectNodeCount?: number; allowNodes?: string[]; forbidNodes?: string[]; forbidText?: string[]; expectNoRecord?: boolean; expectChange?: boolean };

const DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
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
  const questions = cases.length * n;
  requireRun([
    `질문 ${cases.length}개 × ${n}회 = ${questions}번 · 모델 호출 약 ${Math.ceil(questions * EST_ROUNDS)}회(Sonnet 4.6 고정)`,
    `예상 원가 약 $${(questions * EST_USD_PER_QUESTION).toFixed(2)}(질문당 약 $${EST_USD_PER_QUESTION} — 실측 전 추정)`,
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
  try {
    for (const c of cases) {
      let caseRight = 0;
      for (let i = 0; i < n; i++) {
        total += 1;
        const r = await askMap(userId, c.question, { callModel: sendMessage, data: persona, dailyLimit: Infinity });
        if (!r.ok) {
          saveLiveFailure("replay-map-agent", c.name, r);
          continue;
        }
        cost += r.stats.costMicroUsd;
        submitted += r.stats.submittedClaims;
        dropped += r.stats.droppedClaims;
        const cited = r.answer.claims.flatMap((cl) => cl.nodes.map((x) => `${KIND[x.kind]}:${x.title}`));
        const allowed = new Set([...(c.expectNodes ?? []), ...(c.allowNodes ?? [])]);
        citedAll += cited.length;
        citedGood += cited.filter((x) => allowed.has(x)).length;
        const pass =
          (c.expectNodes ?? []).every((x) => cited.includes(x)) &&
          (c.expectNodeCount === undefined || cited.filter((x) => x === c.expectNodes![0]).length >= c.expectNodeCount) &&
          !(c.forbidNodes ?? []).some((x) => cited.includes(x)) &&
          (!c.expectNoRecord || (r.answer.claims.length === 0 && !!r.answer.noRecord)) &&
          (!c.expectChange || r.answer.asksChange) &&
          !(c.forbidText ?? []).some((w) => JSON.stringify(r.answer).includes(w));
        if (pass) {
          right += 1;
          caseRight += 1;
        } else {
          saveLiveFailure("replay-map-agent", c.name, r);
        }
      }
      console.log(`${c.name}: ${caseRight}/${n}`);
    }
  } finally {
    await prisma.chatV3Usage.updateMany({ where: { userId }, data: { userId: null } });
    await deleteAccountTx(userId);
  }
  const pct = (a: number, b: number) => (b === 0 ? "—" : (a / b).toFixed(3));
  console.log(`\n정답률 ${pct(right, total)}(기준 ≥ 0.8) · 근거 정밀도 ${pct(citedGood, citedAll)}(≥ 0.9) · 근거 없는 주장 ${pct(dropped, submitted)}(≤ 0.05) · 1회 $${(cost / Math.max(total, 1) / 1e6).toFixed(4)}(≤ $0.05)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
