// 기억 에이전트 연구 트랙 — 임베딩 배치 래퍼(voyage-3.5, 1024차원).
//
// lib/embeddings.ts 를 수정 없이 재사용하고, 거기 없는 배치 상한·타임아웃·예산
// 가드·원가 기록만 덧붙인다. lib/embeddings 는 Voyage 의 usage 를 돌려주지 않으므로
// 토큰은 글자 수로 보수 추정한다(원가 자체가 미미 — 카드 200장 ≈ $0.002).
// Voyage 키는 운영과 같은 VOYAGE_API_KEY(결정 3 의 전용 키 규칙은 Anthropic 한정).

import {
  EMBEDDING_MODEL,
  embedTexts,
  type EmbeddingInputType,
} from "../embeddings";
import { assertLabBudget, estimateCostMicroUsd, recordLabUsage } from "./usage";

export const LAB_EMBED_BATCH = 64;
const LAB_EMBED_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Voyage 임베딩 ${ms}ms 초과`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function approxTokens(texts: string[]): number {
  return texts.reduce((n, t) => n + t.length, 0);
}

export async function labEmbed(
  texts: string[],
  inputType: EmbeddingInputType,
  meta: { userId: string | null; refId?: string },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  await assertLabBudget(
    estimateCostMicroUsd(EMBEDDING_MODEL, { input: approxTokens(texts) }),
  );

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += LAB_EMBED_BATCH) {
    const batch = texts.slice(i, i + LAB_EMBED_BATCH);
    vectors.push(
      ...(await withTimeout(
        embedTexts(batch, inputType),
        LAB_EMBED_TIMEOUT_MS,
      )),
    );
    await recordLabUsage({
      purpose: "EMBED",
      model: EMBEDDING_MODEL,
      userId: meta.userId,
      refId: meta.refId,
      inputTokens: approxTokens(batch),
    });
  }
  return vectors;
}
