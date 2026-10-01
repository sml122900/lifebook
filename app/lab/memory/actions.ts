"use server";

import { prisma } from "@/lib/db";
import { requireLabSubject } from "@/lib/lab/access";
import { runAgent } from "@/lib/lab/agent";
import type { VerifiedAnswer } from "@/lib/lab/answer";
import {
  diffSources,
  summarizeDiff,
  type SourceDiffSummary,
} from "@/lib/lab/diff";
import { searchWithQuestion, type SearchResult } from "@/lib/lab/search";
import { syncSubject, type SyncReport } from "@/lib/lab/sync";

// 기억 연구실 서버 액션. 모든 액션의 첫 문장은 requireLabUser()/requireLabSubject()
// — db/test-lab-gate.ts 가 정적 검사로 강제한다(서버 액션은 어느 주소에서나
// 호출될 수 있어 화면 게이트만으로는 부족).

// 서버 액션 1회당 LLM 추출 원본 상한 — Vercel 함수 시간 초과 대비. 남은 원본은
// 다시 누르면 이어서 처리한다(대량은 로컬 db/lab-sync.ts).
const SYNC_MAX_LLM_UNITS = 20;

// 대상의 원본을 다시 읽어 색인 원장과 비교(LLM 0, 쓰기 0).
export async function getSourceDiffAction(
  subjectId: string,
): Promise<SourceDiffSummary> {
  await requireLabSubject(subjectId);
  return summarizeDiff(await diffSources(subjectId));
}

// 신규·변경 원본 추출 + 소멸 반영 + 임베딩(쓰기는 lab 테이블만).
export async function syncSubjectAction(
  subjectId: string,
): Promise<SyncReport> {
  await requireLabSubject(subjectId);
  return syncSubject(subjectId, { maxLlmUnits: SYNC_MAX_LLM_UNITS });
}

// 검색 디버그 — 평가기(db/lab-eval.ts)와 같은 searchWithQuestion 경로.
export async function searchCardsAction(
  subjectId: string,
  input: {
    query: string;
    yearFrom?: number;
    yearTo?: number;
    useQuestionTimeHint: boolean;
    limit?: number;
  },
): Promise<SearchResult> {
  await requireLabSubject(subjectId);
  return searchWithQuestion(subjectId, {
    query: input.query.slice(0, 300),
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    useQuestionTimeHint: input.useQuestionTimeHint,
    limit: input.limit,
    refId: "search:debug",
  });
}

// ── 질의응답 에이전트(R2-3) ─────────────────────────────────────────

export type AskView = {
  runId: string;
  text: string;
  citations: {
    n: number;
    source: string;
    summary: string;
    quote: string | null;
  }[];
  stats: VerifiedAnswer["stats"];
  rounds: number;
  costMicroUsd: number;
  tools: string[];
  error: string | null;
};

export type RunListItem = {
  id: string;
  question: string;
  text: string | null; // null = 근거 원본이 지워져 답을 비움(삭제 전파)
  rounds: number;
  costMicroUsd: number;
  createdAt: string;
};

// 질문 1개 → 에이전트 실행(LabAgentRun 저장) → 인용 카드 내용을 붙여 돌려준다.
export async function askAgentAction(
  subjectId: string,
  question: string,
): Promise<AskView> {
  await requireLabSubject(subjectId);
  const r = await runAgent(subjectId, question, { source: "UI" });
  const cards = await prisma.memoryCard.findMany({
    where: {
      id: { in: r.answer.citations.map((c) => c.cardId) },
      userId: subjectId,
    },
    select: { id: true, sourceType: true, summary: true, quote: true },
  });
  return {
    runId: r.runId,
    text: r.answer.text,
    citations: r.answer.citations.map((c) => {
      const card = cards.find((x) => x.id === c.cardId);
      return {
        n: c.n,
        source: card?.sourceType ?? "(지워진 카드)",
        summary: card?.summary ?? "",
        quote: card?.quote ?? null,
      };
    }),
    stats: r.answer.stats,
    rounds: r.rounds,
    costMicroUsd: r.costMicroUsd,
    tools: r.toolTrace.map((t) => t.tool),
    error: r.error,
  };
}

// 최근 답 10개(읽기만).
export async function listAgentRunsAction(
  subjectId: string,
): Promise<RunListItem[]> {
  await requireLabSubject(subjectId);
  const rows = await prisma.labAgentRun.findMany({
    where: { userId: subjectId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      question: true,
      answer: true,
      rounds: true,
      costMicroUsd: true,
      createdAt: true,
    },
  });
  return rows.map((r) => {
    const a = r.answer as { text?: unknown; redacted?: unknown } | null;
    return {
      id: r.id,
      question: r.question,
      text:
        a?.redacted === true
          ? null
          : typeof a?.text === "string"
            ? a.text
            : null,
      rounds: r.rounds,
      costMicroUsd: r.costMicroUsd,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
