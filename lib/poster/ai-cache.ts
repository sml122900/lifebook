// 포스터 AI 결과 고정 — P3 문장 원본 해시 + P1 후보 캐시.
// 설계: docs/phase/v3-poster-bridge.md "포스터 AI 문장 고정"
//
// 같은 입력이면 AI 를 다시 부르지 않는다(매 로드 재생성 → 요지·추천·문장이 바뀌던 문제).
// - P3 문장: Poster.selections 항목의 generatedText·sourceHash·generatedAt(snapshot.ts).
//   여기선 원본 해시만 만든다.
// - P1 후보: Poster.design.candidateCache. design 은 "P5 디자인 자리"로 만든 컬럼인데
//   P5 가 별도 컬럼(bgSetCount·customBgPath)을 써서 비어 있었다 — 스키마 변경 없이
//   쓰려고 네임스페이스 키로 재사용(2026-10-24 결정).
// 해시는 AI 에 들어가는 입력 전부를 묶는다(P3 = 제목·본문·연도 + 유형·템플릿,
// P1 = id·제목·본문·연도·카테고리). 하나라도 바뀌면 다시 생성.

import { createHash } from "node:crypto";

import { prisma } from "../db";
import type { Prisma } from "../generated/prisma/client";
import {
  selectPosterCandidates,
  type PosterCandidate,
  type PosterCandidateInput,
} from "./poster-candidates";
import type { PosterEventInput } from "./poster-sentences";

function sha256(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function sentenceSourceHash(
  input: PosterEventInput,
  type: "node" | "memo",
  template: string | null,
): string {
  return sha256([input.title, input.content, input.year, type, template]);
}

function candidateInputHash(inputs: PosterCandidateInput[]): string {
  return sha256(inputs.map((i) => [i.eventId, i.title, i.content, i.year, i.category]));
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// P1 후보 — 입력이 저장해 둔 것과 같으면 그 결과(AI 호출 0), 다르면 새로 분류해 저장.
// AI 실패·응답 해석 실패로 기본값이 나온 결과는 저장하지 않는다(다음 로드에 다시 시도).
export async function getPosterCandidates(
  userId: string,
  inputs: PosterCandidateInput[],
): Promise<PosterCandidate[]> {
  if (inputs.length === 0) return [];

  const poster = await prisma.poster.findUnique({ where: { userId }, select: { design: true } });
  const design = asObject(poster?.design) ?? {};
  const inputHash = candidateInputHash(inputs);
  const cache = asObject(design.candidateCache);
  const cached = cache?.inputHash === inputHash && Array.isArray(cache.candidates) ? cache.candidates : null;
  if (
    cached &&
    cached.length === inputs.length &&
    cached.every((c, i) => asObject(c)?.eventId === inputs[i].eventId)
  ) {
    return cached as PosterCandidate[];
  }

  const { candidates, fromAi } = await selectPosterCandidates(inputs);
  if (fromAi) {
    const next = {
      ...design,
      candidateCache: { inputHash, generatedAt: new Date().toISOString(), candidates },
    } as Prisma.InputJsonObject;
    await prisma.poster.upsert({
      where: { userId },
      create: { userId, design: next },
      update: { design: next },
    });
  }
  return candidates;
}
