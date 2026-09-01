"use server";

// P7-7 — 실제 로직은 lib/chat-v3-pending.ts(순수, auth 없음). 이 파일은
// auth 게이트만 (lib/account-deletion.ts·lib/person-chat.ts 와 같은 패턴).

import { auth } from "@/auth";
import {
  setPendingChatContext as setPendingChatContextCore,
  clearPendingChatContext as clearPendingChatContextCore,
  getPendingChatContext as getPendingChatContextCore,
  type PendingChatContext,
} from "@/lib/chat-v3-pending";
import type { ChatV3PendingStage } from "@/lib/generated/prisma/enums";

export type { PendingChatContext } from "@/lib/chat-v3-pending";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

export async function setPendingChatContext(
  userId: string,
  stage: ChatV3PendingStage,
  targetEventId: string,
  targetPersonId: string | null = null,
): Promise<void> {
  await requireUserId(userId);
  return setPendingChatContextCore(userId, stage, targetEventId, targetPersonId);
}

export async function clearPendingChatContext(userId: string): Promise<void> {
  await requireUserId(userId);
  return clearPendingChatContextCore(userId);
}

export async function getPendingChatContext(userId: string): Promise<PendingChatContext | null> {
  await requireUserId(userId);
  return getPendingChatContextCore(userId);
}
