"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  stashEraEvent,
  unstashEraEvent,
  type StashResult,
} from "@/lib/era-stash";

// Phase E2 — /era 의 "내 연혁에 담기" / "빼기" server actions.
// 인증 가드는 양쪽 모두 — proxy.ts 가 1차로 보호하지만 actions 도 defense.
// revalidatePath 는 두 경로:
//   /era            — 카드 "담음" 표시 토글
//   /life-timeline  — 연혁에 새 era 행 등장/제거

export async function stashEraEventAction(
  monthEventId: string,
): Promise<StashResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const result = await stashEraEvent(session.user.id, monthEventId);
  if (result === "stashed" || result === "already") {
    revalidatePath("/era");
    revalidatePath("/life-timeline");
  }
  return result;
}

export async function unstashEraEventAction(
  monthEventId: string,
): Promise<{ removed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const r = await unstashEraEvent(session.user.id, monthEventId);
  revalidatePath("/era");
  revalidatePath("/life-timeline");
  return r;
}
