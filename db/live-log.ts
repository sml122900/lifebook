// 실제 모델을 부르는 회귀(test-chat-proposal·test-interview·test-open-promote·test-p23·test-person-mode)가 같이 쓰는 도구.
// 2026-11-02 — 회귀·반복 재현이 전역 하루 예산을 넘겨 운영 자유 대화가 멈춘 일 뒤에 만들었다.
//
//   requireTestBudget  — 오늘 테스트 계정(이메일 최상위 도메인 .invalid·.test)이 쓴 원가가 CHAT_V3_TEST_BUDGET_USD(기본 $10)를 넘었으면
//                        모델을 부르기 전에 멈춘다(throw). 앱의 전역 하루 예산(일반 계정만 셈)과 따로.
//                        (원장 ChatV3Usage 에 남는 호출 — 자유 대화 응답·제안·인터뷰 제안 — 만 센다.)
//   saveLiveFailure    — 흔들리는 실제 모델 항목이 실패하면 입출력을 db/test-logs/live-failures/ 에 파일로 남긴다.
//   appendLiveStat     — 통과/실패가 아닌 비율 기록(예: 시나리오 A 4턴째 제안 여부)을 db/test-logs/live-stats.jsonl 에 쌓는다.
// db/test-logs/ 는 커밋하지 않는다(.gitignore).

import fs from "node:fs";
import path from "node:path";

import { testBudgetMicroUsd, testSpentTodayMicroUsd } from "../lib/chat-v3-usage";

const LOG_DIR = path.resolve(__dirname, "test-logs");

export async function requireTestBudget(script: string): Promise<void> {
  const [spent, limit] = await Promise.all([testSpentTodayMicroUsd(), Promise.resolve(testBudgetMicroUsd())]);
  const usd = (n: number) => `$${(n / 1e6).toFixed(4)}`;
  if (spent >= limit) {
    throw new Error(`[${script}] 테스트 한도 초과 — 오늘 테스트 계정 원가 ${usd(spent)} ≥ CHAT_V3_TEST_BUDGET_USD ${usd(limit)}. 모델을 부르지 않고 멈춤.`);
  }
  console.log(`[${script}] 테스트 한도 — 오늘 ${usd(spent)} / ${usd(limit)}`);
}

let saved = 0;
export function saveLiveFailure(script: string, label: string, io: unknown): string {
  const dir = path.join(LOG_DIR, "live-failures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${script}-${new Date().toISOString().replace(/[:.]/g, "-")}-${++saved}.json`);
  fs.writeFileSync(file, JSON.stringify({ script, label, at: new Date().toISOString(), io }, null, 1));
  console.log(`   ↳ 입출력 저장: ${path.relative(process.cwd(), file)}`);
  return file;
}

// 한 줄 추가하고, 같은 key 로 쌓인 기록 전부를 돌려준다(누적 비율 계산용).
export function appendLiveStat<T extends Record<string, unknown>>(key: string, record: T): (T & { key: string; at: string })[] {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, "live-stats.jsonl");
  fs.appendFileSync(file, `${JSON.stringify({ key, at: new Date().toISOString(), ...record })}\n`);
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T & { key: string; at: string })
    .filter((r) => r.key === key);
}
