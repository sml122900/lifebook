"use server";

// v3 통합 채팅(P2) — 갭 감지 결과를 클라(story-review, ChatV3Client "open"
// 단계)에 노출하는 얇은 래퍼. 계산 자체는 lib/gap-detector.ts(순수 읽기).

import { auth } from "@/auth";
import { detectGaps, pickTopGaps, type Gap } from "@/lib/gap-detector";

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

// P3-2 — /story-review 의 time_gap 카드가 anchor eventId 로 돌아올 때, 그
// 구간의 정확한 문구(userPrompt)를 다시 찾기 위한 조회. top N 에 안 들어있는
// gap 도 잡아야 해서 detectGaps 전체에서 찾는다.
export async function getGapByEventId(userId: string, eventId: string): Promise<Gap | null> {
  await requireUserId(userId);
  const gaps = await detectGaps(userId);
  return gaps.find((g) => g.targetEventId === eventId && g.type === "time_gap") ?? null;
}
