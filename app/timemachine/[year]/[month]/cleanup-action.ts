"use server";

import { auth } from "@/auth";
import { chargeOneShot } from "@/lib/tokens/charge";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import { MIN_BALANCE_TO_START_CYCLE } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";
import { cleanupVoiceText } from "@/lib/voice-cleanup";

// Phase T4 — 음성으로 받아쓴 텍스트를 AI 로 다듬는 server action.
//
// 순서:
//   1) 인증 확인 (userId 는 서버 세션에서만)
//   2) 잔액 사전 체크 — 부족하면 AI 호출 자체 차단 (돈 안 드는 사전 차단)
//   3) cleanupVoiceText 호출 (RAG 가드 시스템 프롬프트)
//   4) chargeOneShot 으로 실제 토큰 사용량 만큼 차감
//   5) 결과(다듬은 텍스트 + 사용 토큰 + 남은 잔액) 반환
//
// 차감은 호출 성공한 경우에만 — cleanupVoiceText 가 throw 하면 charge
// 까지 가지 않으므로 사용자가 돈 안 내고 끝남.

export type CleanupResult = {
  cleaned: string;
  tokensSpent: number;
  balanceAfter: number;
};

export async function cleanupVoiceTextAction(
  rawText: string,
): Promise<CleanupResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  const userId = session.user.id;

  if (typeof rawText !== "string" || rawText.trim() === "") {
    throw new Error("empty text");
  }

  const balance = await getBalance(userId);
  if (balance < MIN_BALANCE_TO_START_CYCLE) {
    throw new InsufficientBalanceError();
  }

  const result = await cleanupVoiceText(rawText);
  const charge = await chargeOneShot(
    userId,
    result.inputTokens,
    result.outputTokens,
    "voice_cleanup",
  );

  return {
    cleaned: result.cleaned,
    tokensSpent: charge.tokensSpent,
    balanceAfter: charge.balanceAfter,
  };
}
