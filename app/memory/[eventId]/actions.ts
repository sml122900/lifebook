"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendUserAnswer, summarizeAnswer } from "@/lib/memory-chat";
import { settleConversationCharges } from "@/lib/tokens/charge";
import { MIN_BALANCE_TO_START_CYCLE } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}

// Phase 7.4 — persist a user's answer as a UserMemory row, tied to the
// event that prompted it. AI is only used to write the short title;
// the answer text itself is saved verbatim into content so no fact the
// user didn't say gets recorded.

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

  // Make sure the conversation actually belongs to this user — never
  // append to someone else's row even if the hidden id is tampered with.
  const conv = await prisma.aIConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, eventId: true },
  });
  if (!conv || conv.userId !== userId || conv.eventId !== eventId) {
    throw new Error("conversation mismatch");
  }

  // Pre-flight balance check so an empty wallet doesn't make a paid
  // summarize call. The page itself blocks new cycles upstream; this
  // is the second gate for the answer-submit path.
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

  // Same access rule as the page: only confirmed-trigger or anchor.
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

  // ⚠️ userId scope is mandatory — first real write to UserMemory.
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

  // Persist the answer in the conversation history too so the next
  // visit to /memory/[eventId] can show "이전에 남긴 추억".
  await appendUserAnswer(conversationId, answer);

  // Record the summary AI call as an assistant message so settle() can
  // pick it up alongside the original guided-questions call. Charging
  // both at once means a typical cycle (~1,113 AI tokens) costs 1
  // service token, not 1+1.
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

  // Settle every unsettled AI call in this conversation in one charge.
  // Reusing the same memory (cached conversation, no new AI calls)
  // leaves nothing unsettled, so this is a no-op then.
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
