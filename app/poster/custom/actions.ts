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
  cleanupPosterBackgrounds,
  removePosterBackground,
  uploadPosterBackground,
} from "@/lib/storage";
import { getBalance } from "@/lib/tokens/wallet";

export type GenCustomBgResult =
  | {
      ok: true;
      imageDataUrl: string;
      bgPath: string;
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
  prevPath: string | null = null,
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

  // 3) 생성 이미지를 즉시 Storage 에 영속(미리보기 단계). 이렇게 해야 "결정"
  //    이 base64(~16MB)가 아니라 경로 문자열만 서버로 보내 Vercel 요청 본문
  //    한도(503)를 원천 회피한다. 버퍼는 서버에서 생성돼 요청으로 오가지 않는다.
  let bgPath: string;
  try {
    bgPath = await uploadPosterBackground(userId, result.buffer);
  } catch (e) {
    // 업로드 실패 → 차감 롤백(생성 실패와 동일 처리).
    await rollbackBgCharge(userId, charge.charged);
    return {
      ok: false,
      reason: "gen_failed",
      message: e instanceof Error ? e.message : "이미지를 저장하지 못했어요.",
    };
  }

  // 직전 미리보기(다시 만들기로 버려진 그림)는 정리 — 세트 내 orphan 방지.
  // 아직 DB 에 연결 안 된 임시 그림만 지운다(fire-and-forget).
  if (prevPath && prevPath !== bgPath) {
    void removePosterBackground(prevPath).catch((e) => {
      console.error("[poster-bg] 이전 미리보기 정리 실패", e instanceof Error ? e.message : e);
    });
  }

  // 4) 성공 → 세트 카운트 영속.
  await persistBgSetCount(userId, charge.nextCount);

  return {
    ok: true,
    imageDataUrl: `data:image/png;base64,${result.buffer.toString("base64")}`,
    bgPath,
    setCount: charge.nextCount,
    regensLeft: charge.regensLeft,
    charged: charge.charged,
    unstable: result.unstable,
    balanceAfter: await getBalance(userId),
  };
}

// P5-5c — "이 배경으로 결정": 생성 단계에서 이미 Storage 에 올라간 경로만 받아
// Poster.template="custom" + customBgPath 로 확정한다. base64 를 인자로 받지
// 않으므로 큰 그림에서도 요청 본문이 작아 Vercel 한도 503 이 안 난다.
export async function saveCustomBackground(
  bgPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  // 본인 소유 경로만 허용 — 세션 userId 를 박아 다른 사용자/임의 경로 주입 차단.
  // (uploadPosterBackground 가 만드는 형식: poster-bg/{userId}/{ts}.png)
  if (!new RegExp(`^poster-bg/${userId}/\\d+\\.png$`).test(bgPath)) {
    return { ok: false, error: "이미지 경로가 올바르지 않아요." };
  }

  // DB upsert·정리에서 던져도 클라가 503/무한 "저장 중"에 빠지지 않게 감싼다.
  try {
    await prisma.poster.upsert({
      where: { userId },
      create: { userId, template: "custom", customBgPath: bgPath },
      update: { template: "custom", customBgPath: bgPath },
    });

    // orphan 정리 — 방금 확정한 bgPath 만 남기고 poster-bg/{userId}/ 의 나머지
    // (이전 확정 배경 + 결정 없이 이탈한 미리보기)를 모두 청소. 응답을 막지
    // 않게 fire-and-forget.
    void cleanupPosterBackgrounds(userId, bgPath).catch((e) => {
      console.error("[poster-bg] orphan 정리 실패", e instanceof Error ? e.message : e);
    });

    revalidatePath("/poster/view");
    revalidatePath("/poster");
    return { ok: true };
  } catch (e) {
    console.error("[poster-bg] saveCustomBackground 실패", e instanceof Error ? e.stack ?? e.message : e);
    return { ok: false, error: "배경을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}
