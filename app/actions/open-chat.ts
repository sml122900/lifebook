"use server";

// v3 통합 채팅(P2) — 골격+확인질문이 다 끝난 뒤 "open" 단계의 자유 대화 한 턴.
//
// P13-4(b) — 이전엔 멀티턴 상태·요약·저장 없이 짧게 반응만 했다(그래서 여기서
// 꺼낸 실제 이야기가 통째로 유실). 이제 한 턴을 분류해 실질 이야기면 CUSTOM
// LifeEvent 를 만들고 "promoted" 로 돌려준다 — 클라(ChatV3Client)가 그
// 이벤트로 에피소드 엔진(STAGE4)을 이어 마무리 시 Episode 저장 + 인물
// 추출까지 기존 경로를 그대로 탄다. 인사·짧은 반응은 "reply" 로 예전처럼
// 반응만. 실제 로직은 lib/open-chat-promote.ts(순수, 검증 스크립트 공유).

import { auth } from "@/auth";
import { promoteOpenTurn, type PromoteOpenTurnResult } from "@/lib/open-chat-promote";

export type { PromoteOpenTurnResult } from "@/lib/open-chat-promote";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

export async function respondToOpenChat(userId: string, text: string): Promise<PromoteOpenTurnResult> {
  await requireUserId(userId);
  return promoteOpenTurn(userId, text);
}
