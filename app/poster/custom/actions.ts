"use server";

// P5-4 — 맞춤배경 생성 서버 액션(차감 + 세트 상한 + 생성 + 검수 루프 연결).
//
// 흐름: 차감/세트 결정 → 생성(P5-2/3 검수 루프) → 성공 시 카운트 영속,
// 실패 시 차감 롤백. 잔액 부족/새 세트 확인 필요는 명확한 reason 으로 반환.
// 이미지는 지금 base64 data URL 로 미리보기 반환 — Storage 영속·Poster 연결은 P5-5.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { buildBackgroundPrompt } from "@/lib/poster/background-prompt";
import { generatePosterBackground } from "@/lib/poster/background-generate";
import { getPreferencesForBackground } from "@/lib/poster/preferences";
import {
  chargeForBackgroundGeneration,
  persistBgSetCount,
  rollbackBgCharge,
} from "@/lib/poster/background-set";
import {
  removePosterBackground,
  uploadPosterBackground,
} from "@/lib/storage";
import { getBalance } from "@/lib/tokens/wallet";

export type GenCustomBgResult =
  | {
      ok: true;
      imageDataUrl: string;
      setCount: number;
      regensLeft: number;
      charged: boolean;
      unstable: boolean;
      balanceAfter: number;
    }
  | {
      ok: false;
      reason: "unauthorized" | "need_new_set_confirm" | "insufficient_balance" | "gen_failed";
      message?: string;
    };

export async function generateCustomBackground(
  confirmNewSet = false,
): Promise<GenCustomBgResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "unauthorized" };
  const userId = session.user.id;

  // 1) 차감/세트 결정(새 세트면 30토큰 차감 — 잔액 부족 시 여기서 막힘).
  const charge = await chargeForBackgroundGeneration(userId, confirmNewSet);
  if (!charge.ok) return { ok: false, reason: charge.reason };

  // 2) 생성 + 검수 루프(P5-3). 취향은 DB 병합(사용자 우선). 검수 자동재생성은
  //    시스템 흡수(추가 차감 X).
  const preferences = await getPreferencesForBackground(userId);
  const prompt = buildBackgroundPrompt(preferences);
  let result;
  try {
    result = await generatePosterBackground(prompt);
  } catch (e) {
    // 생성 실패 → 차감 롤백(카운트는 미영속이라 그대로).
    await rollbackBgCharge(userId, charge.charged);
    return {
      ok: false,
      reason: "gen_failed",
      message: e instanceof Error ? e.message : "이미지 생성에 실패했어요.",
    };
  }

  // 3) 성공 → 세트 카운트 영속.
  await persistBgSetCount(userId, charge.nextCount);

  return {
    ok: true,
    imageDataUrl: `data:image/png;base64,${result.buffer.toString("base64")}`,
    setCount: charge.nextCount,
    regensLeft: charge.regensLeft,
    charged: charge.charged,
    unstable: result.unstable,
    balanceAfter: await getBalance(userId),
  };
}

// P5-5c — "이 배경으로 결정": 미리보기(base64)를 Storage 에 영속 저장 +
// Poster.template="custom" + customBgPath. 기존 배경은 교체 후 정리(orphan 방지).
export async function saveCustomBackground(
  imageDataUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  const m = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl);
  if (!m) return { ok: false, error: "이미지 형식이 올바르지 않아요." };
  const buffer = Buffer.from(m[1]!, "base64");
  if (buffer.length === 0 || buffer.length > 12 * 1024 * 1024) {
    return { ok: false, error: "이미지 크기가 올바르지 않아요." };
  }

  const prev = await prisma.poster.findUnique({
    where: { userId },
    select: { customBgPath: true },
  });

  const path = await uploadPosterBackground(userId, buffer);
  await prisma.poster.upsert({
    where: { userId },
    create: { userId, template: "custom", customBgPath: path },
    update: { template: "custom", customBgPath: path },
  });

  // 이전 배경 정리(교체 시). 실패는 무시(orphan 정도, 치명 X).
  if (prev?.customBgPath && prev.customBgPath !== path) {
    await removePosterBackground(prev.customBgPath).catch(() => {});
  }

  revalidatePath("/poster/view");
  revalidatePath("/poster");
  return { ok: true };
}
