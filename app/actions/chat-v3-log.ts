"use server";

// v3 통합 채팅(P2) — /chat-v3 전체 대화 로그 저장/복원.
//
// 이 로그가 생기면서 P1 의 sessionStorage 우회 가드(리마운트 시 잘못된
// resume 분기 방지)는 근본적으로 불필요해졌다 — 리마운트가 나도 이 로그를
// 그대로 다시 그리면 되고, "다음에 뭘 물을지"는 항상 OnboardingProfile/
// LifeEvent 의 실제 상태에서 다시 계산하지 메시지 히스토리를 보고 추측하지
// 않는다.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { AIMessageRole } from "@/lib/generated/prisma/enums";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

// TODO(P3): 대화가 수백 턴 쌓이면 이 상수보다 오래된 턴은 "이전 대화
// 더보기" 버튼으로 커서 기반(createdAt 기준 이전 페이지) 로드해야 한다.
// 지금은 최근 N개만 불러오는 것으로 렌더 부담을 막아둔다(과설계 방지 —
// 실사용 턴 수가 이 상수를 넘기 전까진 페이징 UI 자체가 필요 없다).
const RECENT_MESSAGE_LIMIT = 100;

export type ChatLogTurn = { role: "user" | "assistant"; content: string };

// TODO(P4-4, 보류) — 답변 직후 즉시 페이지를 이탈하면 그 턴의 어시스턴트
// 응답 중 앞 조각(예: "네, 확인했어요.")만 유실되고 뒤이은 다음 질문은
// 정상 저장되는 사고가 보고됨. ChatV3Client 의 addBot 호출은 이미 개별적으로
// await 되어 순차 보장은 있다 — 근본 원인은 브라우저가 페이지를 완전히
// 이탈할 때 이 saveChatMessage 의 fetch(서버 액션)가 keepalive 없이
// 취소되는 것으로 추정. await 를 더 촘촘히 묶어도 이 경로(navigation 중
// 취소)는 근본적으로 못 막는다. 완화안으로 "확인멘트+다음질문을 addBot
// 한 번(1 DB row)으로 합쳐 유실 창구를 줄이기"를 검토했으나, 채팅 버블이
// 2개→1개로 보이는 시각적 변화가 있어 보류(2026-08-31, 사용자 결정).
export async function saveChatMessage(
  userId: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await requireUserId(userId);
  await prisma.onboardingChatMessage.create({
    data: { userId, sessionId, role: role as AIMessageRole, content },
  });
}

export async function listRecentChatMessages(userId: string): Promise<ChatLogTurn[]> {
  await requireUserId(userId);
  const rows = await prisma.onboardingChatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_MESSAGE_LIMIT,
    select: { role: true, content: true },
  });
  return rows.reverse();
}
