// My Life 개편 2단계 — 자유 대화·제안 호출 원가 원장(ChatV3Usage) + 전역 하루 예산 가드.
// docs/phase/my-life-restructure.md §3.7, 결정 Q63(도그푸딩 동안 무료 + 원가 기록).
//
// 하루 = KST 0시부터. 예산 = CHAT_V3_DAILY_BUDGET_USD(기본 5) — 모든 사용자 합계.
// 넘으면 자유 대화 응답·제안을 부르지 않는다(호출부가 lib/free-chat-copy 의 쉬어요 문구를 보여 준다).
// 사용자 토큰은 차감하지 않는다.

import { prisma } from "./db";

export type ChatUsagePurpose = "REPLY" | "PROPOSAL" | "INTERVIEW_PROPOSAL";

const DEFAULT_DAILY_BUDGET_USD = 5;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 백만 토큰당 달러(입력·출력). 모델 이름의 계열로 고른다 — 모르는 계열은 Sonnet 값(보수적).
const PRICE_PER_MTOK = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 5, output: 25 },
} as const;

function priceOf(model: string) {
  if (model.includes("haiku")) return PRICE_PER_MTOK.haiku;
  if (model.includes("opus")) return PRICE_PER_MTOK.opus;
  return PRICE_PER_MTOK.sonnet;
}

// 추정 원가(백만분의 1 달러). 토큰 × 달러/백만토큰 = 마이크로달러.
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return Math.ceil(inputTokens * p.input + outputTokens * p.output);
}

export function dailyBudgetMicroUsd(): number {
  const raw = process.env.CHAT_V3_DAILY_BUDGET_USD;
  const usd = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Math.floor((Number.isFinite(usd) && usd >= 0 ? usd : DEFAULT_DAILY_BUDGET_USD) * 1_000_000);
}

// KST 기준 오늘 0시(= UTC 전날 15시).
export function dayStartKst(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS);
}

export async function spentTodayMicroUsd(now: Date = new Date()): Promise<number> {
  const agg = await prisma.chatV3Usage.aggregate({
    where: { createdAt: { gte: dayStartKst(now) } },
    _sum: { costMicroUsd: true },
  });
  return agg._sum.costMicroUsd ?? 0;
}

export async function isOverDailyBudget(now: Date = new Date()): Promise<boolean> {
  return (await spentTodayMicroUsd(now)) >= dailyBudgetMicroUsd();
}

// 실패해도 대화는 막지 않는다(원장 누락 < 대화 중단).
export async function recordChatUsage(
  userId: string,
  purpose: ChatUsagePurpose,
  r: { model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  try {
    await prisma.chatV3Usage.create({
      data: {
        userId,
        purpose,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costMicroUsd: costMicroUsd(r.model, r.inputTokens, r.outputTokens),
      },
    });
  } catch (e) {
    console.error("[chat-v3-usage] record failed", e instanceof Error ? e.message : e);
  }
}
