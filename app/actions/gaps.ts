"use server";

// v3 통합 채팅(P2) — 갭 감지 결과를 클라(story-review, ChatV3Client "open"
// 단계)에 노출하는 얇은 래퍼. 계산 자체는 lib/gap-detector.ts(순수 읽기).

import { auth } from "@/auth";
import {
  detectGaps,
  getPeriodPromptForEvent,
  pickTopGaps,
  type Gap,
  type PeriodPrompt,
} from "@/lib/gap-detector";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

export async function getTopGaps(userId: string, limit = 3): Promise<Gap[]> {
  await requireUserId(userId);
  const gaps = await detectGaps(userId);
  return pickTopGaps(gaps, limit);
}

// P10-1 — /story-review 의 time_gap 카드, 또는 /chat-v3?gapType=period 딥링크
// (재진입 포함)가 anchor eventId 로 돌아올 때 그 구간의 문구를 다시 찾기
// 위한 조회. 갭이 이미 해소됐어도(그 앵커에 period Episode 가 이미 있어도)
// 동작해야 재진입이 폴백으로 빠지지 않는다 — 그래서 detectGaps 의
// periodResolvedEventIds 필터를 타지 않는다.
export async function getPeriodPromptByEventId(
  userId: string,
  eventId: string,
): Promise<PeriodPrompt | null> {
  await requireUserId(userId);
  return getPeriodPromptForEvent(userId, eventId);
}
