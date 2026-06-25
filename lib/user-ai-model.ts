// 사용자 전역 AI 모델 읽기/쓰기 (서버, prisma). 라이브 호출부가 이걸로 모델을
// 결정한다. 값이 비정상이거나 없으면 DEFAULT_AI_MODEL(haiku) 폴백.

import { cache } from "react";

import { prisma } from "@/lib/db";
import { DEFAULT_AI_MODEL, isAiModel, modelId, type AiModel } from "@/lib/ai-model";

async function _getUserAiModel(userId: string): Promise<AiModel> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiModel: true },
  });
  return isAiModel(u?.aiModel) ? u.aiModel : DEFAULT_AI_MODEL;
}
// request 단위 메모(같은 요청서 여러 호출부가 읽어도 1쿼리).
export const getUserAiModel = cache(_getUserAiModel);

// 라이브 호출에 바로 쓰는 모델 ID + 배수.
export async function resolveLiveModel(
  userId: string,
): Promise<{ tier: AiModel; model: string }> {
  const tier = await getUserAiModel(userId);
  return { tier, model: modelId(tier) };
}

export async function setUserAiModel(
  userId: string,
  model: AiModel,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { aiModel: model },
  });
}
