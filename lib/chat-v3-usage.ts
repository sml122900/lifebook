// My Life 개편 2단계 — 자유 대화·제안 호출 원가 원장(ChatV3Usage) + 전역 하루 예산 가드.
// docs/phase/my-life-restructure.md §3.7, 결정 Q63(도그푸딩 동안 무료 + 원가 기록).
//
// 하루 = KST 0시부터. 예산 = CHAT_V3_DAILY_BUDGET_USD(기본 5) — 모든 사용자 합계. 단 테스트 계정(회귀·측정 픽스처와
// 연구실 페르소나 — 아래 isTestAccountEmail) 사용분은 원가는 그대로 남기되 이 합계에서 뺀다(2026-11-02 — 회귀·반복 재현이
// $5 를 넘겨 그날 운영 자유 대화가 멈췄다). 테스트 사용분은 회귀 스크립트가 따로 CHAT_V3_TEST_BUDGET_USD(기본 10)로 본다
// (db/live-log.ts requireTestBudget).
// 넘으면 자유 대화 응답·제안을 부르지 않는다(호출부가 lib/free-chat-copy 의 쉬어요 문구를 보여 준다).
// 사용자 토큰은 차감하지 않는다.

import { prisma } from "./db";

export type ChatUsagePurpose = "REPLY" | "PROPOSAL" | "INTERVIEW_PROPOSAL" | "MAP_ASK" | "MAP_EDIT"; // 지도 질문·고치기 요청 하나에 한 줄(사용자당 하루 상한이 이 줄 수를 셈 — lib/map-agent)

const DEFAULT_DAILY_BUDGET_USD = 5;
const DEFAULT_TEST_BUDGET_USD = 10;

// 테스트 계정 — 이메일 최상위 도메인이 예약 도메인(RFC 2606) .invalid·.test 인 계정: 회귀·측정 픽스처
// (fixture-*@lifebook.invalid, p23-test-alice@test 등)와 연구실 페르소나(lab-persona-*@lifebook.invalid). 실제 사람은 이런
// 주소를 가질 수 없다. test30@test.com 처럼 실제 도메인(test.com)은 일반 계정(도그푸딩).
export function isTestAccountEmail(email: string | null | undefined): boolean {
  const domain = (email ?? "").toLowerCase().split("@")[1] ?? "";
  const tld = domain.split(".").pop() ?? "";
  return tld === "invalid" || tld === "test";
}
// 계정을 지우면 원장의 userId 가 비워져(SetNull) 나중엔 누구 것인지 알 수 없다 — 기록할 때 purpose 앞에 붙여 둔다
// (스키마 변경 없이). 예: TEST_REPLY.
export const TEST_PURPOSE_PREFIX = "TEST_";
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

// 프롬프트 캐싱 배율(공식 문서 platform.claude.com/docs/en/build-with-claude/prompt-caching — 2026-11-03 확인):
// 5분 캐시 쓰기 = 기본 입력가 × 1.25, 캐시 읽기 = × 0.1(Haiku 4.5·Sonnet 4.6·Opus 4.8). §17.
const CACHE_WRITE_RATE = 1.25;
const CACHE_READ_RATE = 0.1;

// 추정 원가(백만분의 1 달러). 토큰 × 달러/백만토큰 = 마이크로달러. inputTokens 는 입력 전체(캐시 포함 — lib/ai ChatResult),
// 그중 캐시에 쓴 것·읽은 것은 배율로(2026-11-03 — 캐싱 뒤 원가가 입력가 그대로 잡히던 것을 막음).
export function costMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: { writeTokens?: number; readTokens?: number } = {},
): number {
  const p = priceOf(model);
  const write = cache.writeTokens ?? 0;
  const read = cache.readTokens ?? 0;
  const plain = Math.max(0, inputTokens - write - read);
  return Math.ceil(plain * p.input + write * p.input * CACHE_WRITE_RATE + read * p.input * CACHE_READ_RATE + outputTokens * p.output);
}

function envUsdMicro(name: string, fallbackUsd: number): number {
  const raw = process.env[name];
  const usd = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Math.floor((Number.isFinite(usd) && usd >= 0 ? usd : fallbackUsd) * 1_000_000);
}

export function dailyBudgetMicroUsd(): number {
  return envUsdMicro("CHAT_V3_DAILY_BUDGET_USD", DEFAULT_DAILY_BUDGET_USD);
}

// 테스트 계정 하루 한도(회귀·--live 스크립트가 시작 때 본다 — 앱 예산과 따로).
export function testBudgetMicroUsd(): number {
  return envUsdMicro("CHAT_V3_TEST_BUDGET_USD", DEFAULT_TEST_BUDGET_USD);
}

// KST 기준 오늘 0시(= UTC 전날 15시).
export function dayStartKst(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS);
}

// 오늘 쓴 원가 — 일반 계정만(테스트 계정 사용분 제외). 전역 하루 예산 판정이 이 값을 본다.
export async function spentTodayMicroUsd(now: Date = new Date()): Promise<number> {
  const agg = await prisma.chatV3Usage.aggregate({
    where: { createdAt: { gte: dayStartKst(now) }, NOT: { purpose: { startsWith: TEST_PURPOSE_PREFIX } } },
    _sum: { costMicroUsd: true },
  });
  return agg._sum.costMicroUsd ?? 0;
}

// 오늘 테스트 계정이 쓴 원가.
export async function testSpentTodayMicroUsd(now: Date = new Date()): Promise<number> {
  const agg = await prisma.chatV3Usage.aggregate({
    where: { createdAt: { gte: dayStartKst(now) }, purpose: { startsWith: TEST_PURPOSE_PREFIX } },
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
  r: { model: string; inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number },
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    // 캐시 쓰기·읽기 토큰도 칸에(마이그 20261103200000_chat_v3_usage_cache — §17). 원가는 배율로.
    await prisma.chatV3Usage.create({
      data: {
        userId,
        purpose: isTestAccountEmail(user?.email) ? `${TEST_PURPOSE_PREFIX}${purpose}` : purpose,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheWriteTokens: r.cacheWriteTokens ?? 0,
        cacheReadTokens: r.cacheReadTokens ?? 0,
        costMicroUsd: costMicroUsd(r.model, r.inputTokens, r.outputTokens, { writeTokens: r.cacheWriteTokens, readTokens: r.cacheReadTokens }),
      },
    });
  } catch (e) {
    console.error("[chat-v3-usage] record failed", e instanceof Error ? e.message : e);
  }
}
