"use server";

import { auth } from "@/auth";
import { markReactionsSeen, markRecordsSeen } from "@/lib/family-news";

// 가족 소식을 실제로 본 시점에 "읽음" 갱신. userId 는 세션에서만.
// 클라(FamilyNewsSeen)가 카드 mount 시 호출 → 다음 접속 때 배지에서 빠짐.

export async function markReactionsSeenAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await markReactionsSeen(session.user.id);
}

export async function markRecordsSeenAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await markRecordsSeen(session.user.id);
}
