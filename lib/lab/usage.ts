// 기억 에이전트 연구 트랙 — 원가 원장(LabUsage) + 월 예산 가드.
//
// 모든 lab LLM·임베딩 호출은 ① 호출 전 assertLabBudget(최대 예상 원가) ② 호출 후
// recordLabUsage(실사용 토큰) 를 거친다(lib/lab/llm.ts·embed.ts). 사용자 토큰
// 지갑은 건드리지 않는다 — 연구 원가는 이 원장에만.
//
// 월 예산 = LAB_MONTHLY_BUDGET_USD(기본 30), 이번 달 = KST 기준 1일 0시부터.
// 동시 호출 두 건이 함께 통과해 약간 넘칠 수 있다 — 최종 방어선은 전용 키
// (LAB_ANTHROPIC_API_KEY) 워크스페이스의 Console 지출 한도.
//
// 가격표는 추정 원가용 가정값(phase/기억에이전트_R1-R4_기획.md §7) — R1 실측으로 보정.
// "$/백만 토큰" 값이 곧 "토큰당 백만분의 1달러"라 costMicroUsd = 토큰 × 가격.

import { modelId } from "../ai-model";
import { prisma } from "../db";
import { EMBEDDING_MODEL } from "../embeddings";

export type LabPurpose =
  | "EXTRACT"
  | "EMBED"
  | "CONSOLIDATE"
  | "AGENT"
  | "JUDGE"
  | "SMOKE"; // 연결 확인용(db/test-lab-llm.ts --live)

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [modelId("haiku")]: { input: 1, output: 5 },
  [modelId("sonnet")]: { input: 3, output: 15 },
  [modelId("opus")]: { input: 5, output: 25 },
  [EMBEDDING_MODEL]: { input: 0.06, output: 0 },
};
// 프롬프트 캐시: 읽기 = 입력가 × 0.1, 쓰기(5분) = 입력가 × 1.25.
const CACHE_READ_RATE = 0.1;
const CACHE_WRITE_RATE = 1.25;

const DEFAULT_MONTHLY_BUDGET_USD = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type LabTokenUsage = {
  input: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export function estimateCostMicroUsd(model: string, u: LabTokenUsage): number {
  const price = PRICE_PER_MTOK[model];
  // 모르는 모델은 원가를 셀 수 없으니 호출 자체를 막는다(예산 가드 우회 방지).
  if (!price) throw new Error(`lab 가격표에 없는 모델: ${model}`);
  const cost =
    u.input * price.input +
    (u.output ?? 0) * price.output +
    (u.cacheRead ?? 0) * price.input * CACHE_READ_RATE +
    (u.cacheWrite ?? 0) * price.input * CACHE_WRITE_RATE;
  return Math.ceil(cost);
}

// KST 기준 이번 달 1일 0시(= UTC 전날 15시).
export function monthStartKst(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MS,
  );
}

export function monthlyBudgetMicroUsd(): number {
  const usd = Number(process.env.LAB_MONTHLY_BUDGET_USD);
  const valid =
    process.env.LAB_MONTHLY_BUDGET_USD !== undefined &&
    Number.isFinite(usd) &&
    usd >= 0;
  return Math.floor((valid ? usd : DEFAULT_MONTHLY_BUDGET_USD) * 1_000_000);
}

export async function spentThisMonthMicroUsd(
  now: Date = new Date(),
): Promise<number> {
  const agg = await prisma.labUsage.aggregate({
    _sum: { costMicroUsd: true },
    where: { createdAt: { gte: monthStartKst(now) } },
  });
  return agg._sum.costMicroUsd ?? 0;
}

export class LabBudgetExceededError extends Error {
  constructor(
    readonly spentMicroUsd: number,
    readonly estimateMicroUsd: number,
    readonly budgetMicroUsd: number,
  ) {
    super(
      `lab 월 예산 초과: 이번 달 $${(spentMicroUsd / 1e6).toFixed(4)} + 이번 호출 최대 $${(estimateMicroUsd / 1e6).toFixed(4)} > 예산 $${(budgetMicroUsd / 1e6).toFixed(2)}`,
    );
    this.name = "LabBudgetExceededError";
  }
}

export async function assertLabBudget(estimateMicroUsd: number): Promise<void> {
  const budget = monthlyBudgetMicroUsd();
  const spent = await spentThisMonthMicroUsd();
  if (spent + estimateMicroUsd > budget) {
    throw new LabBudgetExceededError(spent, estimateMicroUsd, budget);
  }
}

export async function recordLabUsage(r: {
  purpose: LabPurpose;
  model: string;
  userId: string | null;
  refId?: string;
  inputTokens: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): Promise<void> {
  const costMicroUsd = estimateCostMicroUsd(r.model, {
    input: r.inputTokens,
    output: r.outputTokens,
    cacheRead: r.cacheReadTokens,
    cacheWrite: r.cacheWriteTokens,
  });
  await prisma.labUsage.create({
    data: {
      userId: r.userId,
      purpose: r.purpose,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens ?? 0,
      cacheReadTokens: r.cacheReadTokens ?? 0,
      cacheWriteTokens: r.cacheWriteTokens ?? 0,
      costMicroUsd,
      refId: r.refId ?? null,
    },
  });
}
