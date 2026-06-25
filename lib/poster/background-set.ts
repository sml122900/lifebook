// P5-4 — 맞춤배경 토큰 차감 + 다시생성 상한(세트) 로직.
//
// 경영방 정책:
//   - 1세트 = 30토큰. 최초 1장 + 다시생성 3장 = 최대 4장/세트.
//   - 세트 내 다시생성(2~4장째)은 무료(같은 30토큰 안).
//   - 4장 소진 후 추가 = 새 세트(30토큰 더) — 명시 확인(confirmNewSet) 필요.
//   - 검수 자동재생성(P5-3 내부 3회)은 시스템 흡수 — 여기 카운트·차감과 무관.
//   - ★ STT 무료 flag 와 무관하게 항상 차감(OpenAI 실비용).
// 세트 상태는 Poster.bgSetCount 에 영속(새로고침 견딤). 차감은 chargeOneShot
// 재사용(race-safe — 잔액 부족 시 throw). count 영속은 생성 성공 후에만(action).

import { prisma } from "@/lib/db";
import { chargeOneShot, refundTokens } from "@/lib/tokens/charge";
import { InsufficientBalanceError } from "@/lib/tokens/errors";

export const CUSTOM_BG_TOKEN_COST = 30;
export const IMAGES_PER_SET = 4; // 최초 1 + 다시생성 3

export type BgChargeResult =
  | {
      ok: true;
      charged: boolean; // 이번에 30토큰 차감했나(새 세트)
      nextCount: number; // 생성 성공 시 영속할 세트 카운트
      regensLeft: number; // 이번 생성 후 남는 다시생성 횟수
    }
  | { ok: false; reason: "need_new_set_confirm" | "insufficient_balance" };

// 한 번의 생성 요청에 대한 차감/세트 결정. ★ count 는 여기서 영속하지 않는다 —
// 생성이 성공해야 persistBgSetCount 로 확정(생성 실패 시 카운트 안 올라감).
export async function chargeForBackgroundGeneration(
  userId: string,
  confirmNewSet: boolean,
): Promise<BgChargeResult> {
  const poster = await prisma.poster.findUnique({
    where: { userId },
    select: { bgSetCount: true },
  });
  const count = poster?.bgSetCount ?? 0;
  const needNewSet = count === 0 || count >= IMAGES_PER_SET;

  if (needNewSet) {
    // 세트 소진 후 추가는 명시 확인 필요(첫 세트 count===0 은 진입 자체가 30토큰 안내).
    if (count >= IMAGES_PER_SET && !confirmNewSet) {
      return { ok: false, reason: "need_new_set_confirm" };
    }
    try {
      await chargeOneShot(userId, 0, 0, "custom_bg_set", undefined, CUSTOM_BG_TOKEN_COST);
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        return { ok: false, reason: "insufficient_balance" };
      }
      throw e;
    }
    return { ok: true, charged: true, nextCount: 1, regensLeft: IMAGES_PER_SET - 1 };
  }

  // 세트 내 다시생성 — 무료.
  const nextCount = count + 1;
  return {
    ok: true,
    charged: false,
    nextCount,
    regensLeft: IMAGES_PER_SET - nextCount,
  };
}

// 생성 성공 후 세트 카운트 영속.
export async function persistBgSetCount(
  userId: string,
  nextCount: number,
): Promise<void> {
  await prisma.poster.upsert({
    where: { userId },
    create: { userId, bgSetCount: nextCount },
    update: { bgSetCount: nextCount },
  });
}

// 생성 실패 시 차감 롤백(새 세트로 30 찼던 경우만). count 는 미영속이라 되돌릴 것 없음.
export async function rollbackBgCharge(
  userId: string,
  charged: boolean,
): Promise<void> {
  if (charged) {
    await refundTokens(userId, CUSTOM_BG_TOKEN_COST, "custom_bg_refund");
  }
}

// 현재 세트 상태(UI "N장 더 생성 가능" 표시용).
export async function getBgSetStatus(
  userId: string,
): Promise<{ setCount: number; regensLeft: number; setExhausted: boolean }> {
  const poster = await prisma.poster.findUnique({
    where: { userId },
    select: { bgSetCount: true },
  });
  const count = poster?.bgSetCount ?? 0;
  const inProgress = count > 0 && count < IMAGES_PER_SET;
  return {
    setCount: count,
    regensLeft: inProgress ? IMAGES_PER_SET - count : 0,
    setExhausted: count >= IMAGES_PER_SET,
  };
}
