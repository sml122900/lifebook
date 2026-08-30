"use server";

// v3 통합 채팅(P2) — 갭 감지 결과를 클라(story-review, ChatV3Client "open"
// 단계)에 노출하는 얇은 래퍼. 계산 자체는 lib/gap-detector.ts(순수 읽기).

import { auth } from "@/auth";
import { detectGaps, type Gap } from "@/lib/gap-detector";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

export async function getTopGaps(userId: string, limit = 3): Promise<Gap[]> {
  await requireUserId(userId);
  const gaps = await detectGaps(userId);
  return gaps.slice(0, limit);
}
