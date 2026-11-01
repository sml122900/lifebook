"use server";

// My Life 개편 2단계 — /chat-v3 자유 대화 서버 액션. 본체는 lib/free-chat.ts(순수, auth 없음).
// 모든 액션 첫 줄 = 로그인 확인, 사용자는 세션에서만(클라 값 불신 — 오늘의 인터뷰 액션과 같은 방식).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  adoptLegacyPending,
  closeIdleSegment,
  createFromFreeChatProposal,
  declineFreeChatProposal,
  freeChatReply,
  getFreeChatState,
  proposeFromSegment,
  startFreeTopic,
  type DecideFreeChatResult,
  type FreeChatReplyResult,
  type FreeChatState,
  type FreeTopicInput,
  type ProposeResult,
  type StartTopicResult,
} from "@/lib/free-chat";
import type { CardEdit } from "@/lib/node-proposal";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// 자유 대화에 들어올 때 — 오래된 구간은 닫고(짧으면 조용히 버림, 실질 내용이 있으면 stale 로 카드부터), 개편 전
// 대기 대화가 있으면 주제로 이어받고, 지금 구간 상태(카드·실질 턴)를 돌려준다.
export async function initFreeChatAction(): Promise<FreeChatState> {
  const userId = await requireUserId();
  await closeIdleSegment(userId);
  await adoptLegacyPending(userId);
  return getFreeChatState(userId);
}

export async function startFreeTopicAction(topic: FreeTopicInput, sessionId: string): Promise<StartTopicResult> {
  const userId = await requireUserId();
  return startFreeTopic(userId, topic, String(sessionId).slice(0, 64));
}

export async function freeChatReplyAction(): Promise<FreeChatReplyResult> {
  const userId = await requireUserId();
  return freeChatReply(userId);
}

export async function proposeAction(until: string | null = null): Promise<ProposeResult> {
  const userId = await requireUserId();
  return proposeFromSegment(userId, { until });
}

export async function createProposalAction(edit?: CardEdit): Promise<DecideFreeChatResult> {
  const userId = await requireUserId();
  const result = await createFromFreeChatProposal(userId, edit);
  if (result.ok) {
    // 만든 노드가 My Life 지도·정리 화면·인물 상세에 바로 보이게.
    revalidatePath("/my-life");
    revalidatePath("/story-review");
    revalidatePath("/people/[personId]", "page");
  }
  return result;
}

export async function declineProposalAction(): Promise<{ segmentTurns: number }> {
  const userId = await requireUserId();
  return declineFreeChatProposal(userId);
}
