"use server";

// 오늘의 인터뷰 — 서버 액션. 본체는 lib/interview/session.ts(순수, auth 없음).
// 모든 액션 첫 줄 = requireUserId()(비로그인 throw — db/test-interview.ts 가 정적 검사로
// 강제). 로그인 사용자 전원 대상(2026-10-25 허용 목록 게이트 제거). 문항은 itemId +
// userId 로만 찾으니 남의 문항은 못 건드린다. 대상 사건도 항상 서버가 다시 찾는다(클라 값 불신).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { ContinueEpisodeResult, EpisodeTurn } from "@/lib/episode-chat";
import {
  answerInterviewYear,
  finishInterviewStory,
  interviewStoryTurn,
  nextInterviewState,
  skipInterviewItem,
  startInterviewSession,
  type InterviewState,
  type YearAnswerResult,
} from "@/lib/interview/session";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function startInterviewAction(): Promise<InterviewState> {
  const userId = await requireUserId();
  return startInterviewSession(userId);
}

export async function skipInterviewItemAction(itemId: string): Promise<InterviewState> {
  const userId = await requireUserId();
  return skipInterviewItem(userId, itemId);
}

export async function interviewStoryTurnAction(
  itemId: string,
  history: EpisodeTurn[],
  followUpCount: number,
): Promise<ContinueEpisodeResult> {
  const userId = await requireUserId();
  return interviewStoryTurn(userId, itemId, history, followUpCount);
}

export async function finishInterviewStoryAction(
  itemId: string,
  transcript: EpisodeTurn[],
): Promise<{ ok: true; next: InterviewState } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const result = await finishInterviewStory(userId, itemId, transcript);
  if (!result.ok) return result;
  // app/actions/episode.ts 의 P23-2 와 같은 이유 — 새 Episode 가 인물 상세에 보일 수 있다.
  revalidatePath("/people/[personId]", "page");
  return { ok: true, next: await nextInterviewState(userId) };
}

export async function answerInterviewYearAction(
  itemId: string,
  text: string | null,
): Promise<{ result: YearAnswerResult; next: InterviewState | null }> {
  const userId = await requireUserId();
  const result = await answerInterviewYear(userId, itemId, text);
  if (result.outcome === "retry") return { result, next: null };
  return { result, next: await nextInterviewState(userId) };
}
