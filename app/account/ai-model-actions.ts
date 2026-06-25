"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isAiModel } from "@/lib/ai-model";
import { setUserAiModel } from "@/lib/user-ai-model";

// 전역 AI 모델 갱신 — 설정 페이지 + 라이브 화면 빠른 전환 칩 공용.
// 화면 어디서 바꿔도 User.aiModel 한 값을 갱신 → 모든 라이브 일관(세션한정 아님).
export async function updateAiModel(
  model: string,
): Promise<{ ok: boolean; model?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  if (!isAiModel(model)) return { ok: false };
  await setUserAiModel(session.user.id, model);
  revalidatePath("/account/settings");
  revalidatePath("/life-timeline/companion");
  return { ok: true, model };
}
