"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { STT_TOKEN_CHARGING_ENABLED, calcSttTokens } from "@/lib/stt-cost";
import { getBalance } from "@/lib/tokens/wallet";

// Phase 10 — 통녹음 결과 저장.
// UserMemory(createdVia="free_recording") 신규 행 생성.
// year 는 현재 연도(KST)를 기본값으로 사용 — 사용자가 이야기한 시기는
// content 안에 자연어로 포함되어 있음(Phase 2 에서 분리 예정).

// 전사 시작 전 잔액 확인 + 예상 토큰 계산.
// 과금 플래그 OFF 이면 sufficient=true 로 즉시 반환 (차감 없음).
export async function checkSttBalanceAction(durationSec: number): Promise<{
  chargingEnabled: boolean;
  needed: number;
  balance: number;
  sufficient: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { chargingEnabled: false, needed: 0, balance: 0, sufficient: false };
  }

  if (!STT_TOKEN_CHARGING_ENABLED) {
    return { chargingEnabled: false, needed: 0, balance: 0, sufficient: true };
  }

  const needed = calcSttTokens(durationSec);
  const balance = await getBalance(session.user.id);
  return { chargingEnabled: true, needed, balance, sufficient: balance >= needed };
}

export async function saveFreeRecordingAction(input: {
  audioPath: string;
  transcript: string;
  refined: string;         // Claude 정리본 (사용자가 수정 가능)
  topicTitle: string;      // 물꼬 제목 (title 미러링)
}): Promise<{ ok: boolean; memoryId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const userId = session.user.id;
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();

  try {
    const memory = await prisma.userMemory.create({
      data: {
        userId,
        year,
        title: input.topicTitle.slice(0, 200),
        content: input.transcript.trim() || null,
        refinedText: input.refined.trim() || null,
        displayRefined: input.refined.trim() !== "" && input.refined.trim() !== input.transcript.trim(),
        audioPath: input.audioPath,
        createdVia: "free_recording",
      },
      select: { id: true },
    });

    revalidatePath("/life-timeline");
    return { ok: true, memoryId: memory.id };
  } catch (e) {
    console.error("[saveFreeRecording]", e);
    return { ok: false, error: "저장에 실패했어요. 다시 시도해 주세요." };
  }
}
