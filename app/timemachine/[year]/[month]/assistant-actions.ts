"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  saveAssistantAnswer,
  deleteAssistantAnswer,
  type AnswerSnapshot,
} from "@/lib/timemachine-assistant-saved";

// V3 — 비서 답변 저장/삭제 server action.
// userId 는 서버 세션에서만 — 클라가 보낸 값 절대 신뢰 안 함.

export async function saveAssistantAnswerAction(
  year: number,
  month: number,
  question: string,
  answer: AnswerSnapshot,
): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  const id = await saveAssistantAnswer(
    session.user.id,
    year,
    month,
    question,
    answer,
  );
  revalidatePath(`/timemachine/${year}/${month}`);
  return { id };
}

export async function deleteAssistantAnswerAction(
  year: number,
  month: number,
  id: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  await deleteAssistantAnswer(session.user.id, id);
  revalidatePath(`/timemachine/${year}/${month}`);
}
