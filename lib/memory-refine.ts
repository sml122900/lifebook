// 문장 다듬기 Lv2 (문장 정리 통합) — UserMemory.content 의 맞춤법·띄어쓰기에
// 더해 군말 제거·긴 문장 분리·반복 정리·비문 교정까지 AI 로 다듬어
// refinedText 에 별도 저장한다.
//
// 원칙:
//   - 원문(content)은 영구 보존 — refinedText 는 별도 컬럼, 덮어쓰기 없음
//   - 내용 추가·요약·생략 금지, 사투리·입버릇·특징 표현·고유명사 절대 불변
//     (프롬프트 + 길이 60~120% 서버 검증으로 이중 강제)
//   - 모델 선택 + 차등 차감 — tier(haiku/sonnet/opus) 로 모델·단가가 갈린다.
//     실제 교정본을 저장할 때만 과금(NO_CHANGE·길이가드 탈락은 0). 차감 배수는
//     다듬기 전용 REFINE_MODEL_MULTIPLIER(1/3/8) — 비서와 분리(Opus 원가 방어).
//   - displayRefined=true 일 때만 연혁·상세에서 refinedText 우선 표시.
//     사용자가 [이대로 바꾸기] 를 눌러야 켜진다.
//   - content 가 수정되면 세 필드 모두 초기화 (life-events / era-stash 쪽).

import { chat } from "./ai";
import { prisma } from "./db";
import { chargeOneShot } from "./tokens/charge";
import {
  type ModelTier,
  tokensFromUsage,
  tokensFromUsageForRefine,
} from "./tokens/policy";

// tier → 모델 ID. 비서의 DEPTH_TO_MODEL 과 같은 매핑이지만 다듬기는 depth
// 개념이 없어 tier 를 직접 받는다. opus 4.7 은 ai.ts 의 supportsTemperature
// 가드가 temperature 를 자동 제외(거부 회피).
const TIER_TO_MODEL: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

const SYSTEM_PROMPT = `다음 글을 다듬어라.
허용: 맞춤법·띄어쓰기·구두점 교정, 군말(어/음/그니까/인제 등) 제거,
긴 문장 분리, 같은 말 반복 정리, 비문 교정
문장 첫머리의 군말(그니까, 근데 뭐, 아니 등으로 시작)도 제거
의미를 알아볼 수 없는 자모 깨짐(ㅁㄴㅇ, ㄴㅇ 등)·오타 뭉침은
앞뒤 맥락으로 추정 가능하면 교정하고, 추정 불가하면 그 부분만 삭제
절대 금지: 원문에 없는 내용·사실·감정 추가, 추측으로 살 붙이기,
내용 요약·생략, 사투리·입버릇·특징적 표현 제거, 고유명사 변경,
1인칭 시점 변경
사투리 어형과 입말 표기는 그대로 둔다 (예: 어머이, 어무이, 억수로,
~했당께, ~카더라, 그라모). 표준어로 바꾸는 것 금지.
군말(어, 음, 그니까, 인제, 막)과 사투리는 다르다 — 군말만 제거
요약하지 마라. 군말 제거 외에는 문장이나 내용을 빼지 마라.
NO_CHANGE 는 정말 고칠 게 없는 깨끗한 글에만. 군말·자모 깨짐·오타가
하나라도 있으면 교정한다.
고칠 곳 없으면 정확히 'NO_CHANGE'만. 다듬은 글만 반환, 설명 금지`;

// 길이 가드 — 결과가 원문의 60~120% 를 벗어나면 왜곡(요약·살 붙이기) 의심.
// 저장하지 않고 no_change 처리한다. 하한 0.6 — 군말이 많은 입말 회상은
// 제거만으로 60%대까지 떨어지는 게 정상(실측 67%)이라 0.8 은 과차단.
const LENGTH_RATIO_MIN = 0.6;
const LENGTH_RATIO_MAX = 1.2;

export type RefineStatus = "refined" | "no_change" | "not_found" | "empty";

export type RefineResult = {
  status: RefineStatus;
  refinedText?: string;
  // refined 일 때만 채워짐(실제 과금 발생). no_change 등은 undefined.
  tokensSpent?: number;
  balanceAfter?: number;
};

// ─────────────────────────────────────────────────────────────────────
// 순수 텍스트 교정 — UserMemory 와 무관. 호출자가 텍스트를 직접 넘긴다.
// DB 조회·저장 없이 AI 교정 + 토큰 차감만. 온보딩·CategoryForm 같은
// "저장 전 미리보기" 흐름에서 사용한다.
// ─────────────────────────────────────────────────────────────────────
export async function refineRawText(
  userId: string,
  text: string,
  tier: ModelTier = "haiku",
): Promise<RefineResult> {
  const original = text.trim();
  if (original === "") return { status: "empty" };

  const res = await chat([{ role: "user", content: original }], {
    system: SYSTEM_PROMPT,
    model: TIER_TO_MODEL[tier],
    maxTokens: 2048,
    temperature: 0.2,
  });

  let refined = res.text.trim();
  refined = refined.replace(/^["「『]\s*|\s*["」』]$/g, "");

  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  if (
    refined === "" ||
    refined === "NO_CHANGE" ||
    norm(refined) === norm(original)
  ) {
    return { status: "no_change" };
  }

  const ratio = refined.length / original.length;
  if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) {
    return { status: "no_change" };
  }

  const base = tokensFromUsage(res.inputTokens, res.outputTokens);
  const total = tokensFromUsageForRefine(tier, res.inputTokens, res.outputTokens);
  const charge = await chargeOneShot(
    userId,
    res.inputTokens,
    res.outputTokens,
    `inline_refine_${tier}`,
    undefined,
    total - base,
  );

  return {
    status: "refined",
    refinedText: refined,
    tokensSpent: charge.tokensSpent,
    balanceAfter: charge.balanceAfter,
  };
}

// 본인 메모리의 content 를 tier 모델로 교정해 refinedText 에 저장.
// NO_CHANGE·길이가드 탈락이면 저장도 차감도 안 함. 실제 저장될 때만 과금하되,
// 차감(chargeOneShot)을 저장 *앞*에 두어 잔액 부족이면 저장 없이
// InsufficientBalanceError 가 위로 전파된다(API 가 402 로 변환).
export async function refineMemorySpelling(
  userId: string,
  memoryId: string,
  tier: ModelTier = "haiku",
): Promise<RefineResult> {
  const memory = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId },
    select: { content: true },
  });
  if (!memory) return { status: "not_found" };

  const original = memory.content?.trim() ?? "";
  if (original === "") return { status: "empty" };

  const res = await chat([{ role: "user", content: original }], {
    system: SYSTEM_PROMPT,
    model: TIER_TO_MODEL[tier],
    // 입력 본문이 그대로 다시 나오는 작업 — 긴 회상도 잘리지 않게 넉넉히.
    maxTokens: 2048,
    // 창작 여지 최소화 (voice-cleanup 0.3 보다 더 낮춤 — 교정만).
    // opus 4.7 은 supportsTemperature=false 라 ai.ts 가 이 값을 자동 무시.
    temperature: 0.2,
  });

  let refined = res.text.trim();
  refined = refined.replace(/^["「『]\s*|\s*["」』]$/g, "");

  // NO_CHANGE sentinel 또는 공백 정규화 후 동일 → 고칠 곳 없음, 저장 안 함.
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  if (
    refined === "" ||
    refined === "NO_CHANGE" ||
    norm(refined) === norm(original)
  ) {
    return { status: "no_change" };
  }

  // 길이 60~120% 서버측 체크 — 벗어나면 왜곡 의심, 저장 안 함.
  const ratio = refined.length / original.length;
  if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) {
    return { status: "no_change" };
  }

  // 차등 차감 — chargeOneShot 의 surcharge 로 tier 배수를 표현.
  //   surcharge = tokensFromUsageForRefine(tier) - tokensFromUsage(base)
  //   → 총 cost = base + surcharge = tokensFromUsageForRefine(tier).
  //   haiku 는 multiplier=1 이라 surcharge=0 (현행 비용 그대로). opus=8(원가 방어).
  // 저장 *전에* 차감 → 잔액 부족이면 throw 되어 저장이 일어나지 않는다.
  const base = tokensFromUsage(res.inputTokens, res.outputTokens);
  const total = tokensFromUsageForRefine(tier, res.inputTokens, res.outputTokens);
  const charge = await chargeOneShot(
    userId,
    res.inputTokens,
    res.outputTokens,
    `memory_refine_${tier}`,
    memoryId,
    total - base,
  );

  await prisma.userMemory.updateMany({
    where: { id: memoryId, userId },
    data: { refinedText: refined, refinedAt: new Date() },
  });
  return {
    status: "refined",
    refinedText: refined,
    tokensSpent: charge.tokensSpent,
    balanceAfter: charge.balanceAfter,
  };
}

// [이대로 바꾸기] — refinedText 가 있을 때만 표시 전환. 없으면 false.
export async function applyRefined(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const result = await prisma.userMemory.updateMany({
    where: { id: memoryId, userId, refinedText: { not: null } },
    data: { displayRefined: true },
  });
  return result.count > 0;
}

// [그대로 두기] — 교정본 폐기. 원문은 건드리지 않음.
export async function discardRefined(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const result = await prisma.userMemory.updateMany({
    where: { id: memoryId, userId },
    data: { refinedText: null, refinedAt: null, displayRefined: false },
  });
  return result.count > 0;
}
