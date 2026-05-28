"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendUserAnswer, summarizeAnswer } from "@/lib/memory-chat";
import { settleConversationCharges } from "@/lib/tokens/charge";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import { MIN_BALANCE_TO_START_CYCLE } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

// Phase 7.4 — 사용자의 답을 UserMemory 행으로 저장하고, 그 답을 유발한
// 사건과 연결한다. AI 는 짧은 제목을 쓰는 데만 쓰고, 답 본문 자체는
// content 에 그대로 저장 — 사용자가 말하지 않은 사실은 기록되지 않는다.

export async function submitMemoryAnswer(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const userId = session.user.id;

  const eventId = formData.get("eventId");
  const conversationId = formData.get("conversationId");
  const answerRaw = formData.get("answer");
  if (typeof eventId !== "string" || eventId === "") {
    throw new Error("missing eventId");
  }
  if (typeof conversationId !== "string" || conversationId === "") {
    throw new Error("missing conversationId");
  }
  if (typeof answerRaw !== "string" || answerRaw.trim() === "") {
    throw new Error("empty answer");
  }
  const answer = answerRaw.trim();

  // 대화가 정말 이 사용자 소유인지 확인 — hidden id 가 조작돼도 남의
  // 행에 절대 덧붙이지 않는다.
  const conv = await prisma.aIConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, eventId: true },
  });
  if (!conv || conv.userId !== userId || conv.eventId !== eventId) {
    throw new Error("conversation mismatch");
  }

  // 사전 잔액 체크 — 빈 지갑이 유료 요약 호출을 못 하게. 페이지가 상위에서
  // 새 사이클을 막지만, 이건 답 제출 경로의 두 번째 게이트.
  const balance = await getBalance(userId);
  if (balance < MIN_BALANCE_TO_START_CYCLE) {
    throw new InsufficientBalanceError();
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      year: true,
      month: true,
      title: true,
      description: true,
      category: true,
      domain: true,
    },
  });
  if (!event) {
    throw new Error("event not found");
  }

  // 페이지와 같은 접근 규칙: 확정된 트리거 또는 앵커만.
  if (event.category === "trigger") {
    const r = await prisma.triggerResponse.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { status: true },
    });
    if (r?.status !== "confirmed") {
      throw new Error("trigger not confirmed");
    }
  }

  const summary = await summarizeAnswer(
    {
      title: event.title,
      description: event.description,
      year: event.year,
      category: event.category,
      domain: event.domain,
      ageAtYear: null,
    },
    answer,
  );

  // ⚠️ userId 범위는 필수 — UserMemory 로의 첫 실제 쓰기.
  const memory = await prisma.userMemory.create({
    data: {
      userId,
      eventId,
      year: event.year,
      month: event.month,
      title: summary.title,
      content: answer,
      createdVia: "ai_chat",
    },
    select: { id: true },
  });

  // 답을 대화 기록에도 남겨, 다음에 /memory/[eventId] 재방문 시
  // "이전에 남긴 추억"을 보여줄 수 있게.
  await appendUserAnswer(conversationId, answer);

  // 요약 AI 호출을 assistant 메시지로 기록 → settle() 이 원래 가이드 질문
  // 호출과 함께 한 번에 정산. 둘을 합쳐 차감하면 전형적 사이클(~1,113 AI
  // 토큰)이 1+1 이 아니라 1 서비스 토큰으로 끝난다.
  if (summary.inputTokens > 0 || summary.outputTokens > 0) {
    await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: summary.title,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
      },
    });
  }

  // 이 대화의 미정산 AI 호출을 한 번에 정산. 같은 추억을 재사용(캐시된
  // 대화, 새 AI 호출 없음)하면 미정산이 없어 no-op 이 된다.
  const charge = await settleConversationCharges(
    userId,
    conversationId,
    memory.id,
  );
  if (charge.charged) {
    console.log(
      `[tokens] user=${userId} -${charge.tokensSpent} → ${charge.balanceAfter}`,
    );
  }

  revalidatePath("/timeline");
  redirect("/timeline");
}
