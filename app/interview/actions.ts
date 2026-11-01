"use server";

// 오늘의 인터뷰 — 서버 액션. 본체는 lib/interview/session.ts(순수, auth 없음).
// 모든 액션 첫 줄 = requireUserId()(비로그인 throw — db/test-interview.ts 가 정적 검사로
// 강제). 로그인 사용자 전원 대상(2026-10-25 허용 목록 게이트 제거). 문항은 itemId +
// userId 로만 찾으니 남의 문항은 못 건드린다. 대상 사건도 항상 서버가 다시 찾는다(클라 값 불신).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { ContinueEpisodeResult, EpisodeTurn } from "@/lib/episode-chat";
import type { ProposalView } from "@/lib/free-chat";
import type { CardEdit } from "@/lib/node-proposal";
import {
  answerInterviewYear,
  decideInterviewProposal,
  finishInterviewStory,
  type DecideInterviewResult,
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

// 이야기형 문항 마무리 — 제안 카드(My Life 개편 2단계, Q67). 내용이 없으면 건너뛰기처럼 다음 상태.
export async function finishInterviewStoryAction(
  itemId: string,
  transcript: EpisodeTurn[],
): Promise<{ ok: true; proposal: ProposalView } | { ok: true; proposal: null; next: InterviewState } | { ok: false; error: string }> {
  const userId = await requireUserId();
  return finishInterviewStory(userId, itemId, transcript);
}

// 카드 결정 — 만들기(고친 값) / 안 만들기.
export async function decideInterviewProposalAction(
  itemId: string,
  decision: { kind: "create"; edit?: CardEdit } | { kind: "decline" },
): Promise<DecideInterviewResult> {
  const userId = await requireUserId();
  const result = await decideInterviewProposal(userId, itemId, decision);
  if (result.ok && result.title !== null) {
    // 새 이야기·사람·장소가 My Life·인물 상세·정리 화면에 보이게.
    revalidatePath("/my-life");
    revalidatePath("/story-review");
    revalidatePath("/people/[personId]", "page");
  }
  return result;
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
