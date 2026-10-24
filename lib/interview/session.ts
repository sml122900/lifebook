// 오늘의 인터뷰 — 세션 진행 본체. 순수 모듈(auth 없음) — app/interview/actions.ts 가
// 게이트만 씌워 재노출하고, db/test-interview.ts 가 같은 함수를 userId 로 직접 부른다.
//
// 세션 = (userId, KST 날짜). 시작할 때 그날 문항을 PLANNED 로 한꺼번에 만들어 두고
// (계획 고정 — 재진입해도 같은 순서), 문항을 낼 때마다 아직 유효한지 다시 확인한다
// (그사이 /chat-v3 등에서 채워졌으면 DROPPED 로 넘김).
//
// 답 저장은 기존 경로만 쓴다(§6.1): 이야기형 = finishEpisodeChatCore(Episode + 브릿지 +
// 인물 추출), 연도 = LifeEvent.year(원래 null 인 확정 사건만, status 등 다른 값 무변).
// ⚠️ LifeEvent.status 는 절대 쓰지 않는다 — "SKIPPED"(해당 없음)는 인터뷰의
// "건너뛰기"(InterviewItem.status)와 다른 뜻이다.

import { prisma } from "../db";
import { newAiUsage, trackAiUsage, type AiUsage } from "../ai";
import { isSubstantiveEpisodeContent } from "../episode-text";
import { buildEpisodeOpeningPrompt } from "../episode-opening";
import {
  continueEpisodeChatCore,
  finishEpisodeChatCore,
  type ContinueEpisodeResult,
  type EpisodeTopic,
  type EpisodeTurn,
  type FinishEpisodeResult,
} from "../episode-chat";
import { getPeriodPromptForEvent } from "../gap-detector";
import type { InterviewItem } from "../generated/prisma/client";
import { getConfirmedLifeEvent } from "../life-event-query";
import { INTERVIEW_COPY } from "./copy";
import { kstDay, parseItemKey } from "./keys";
import { computeTodayPlan } from "./plan";
import { QUESTION_POOL } from "./question-pool";
import { isUnknownYearAnswer, parseYearDeterministic, parseYearWithAi } from "./year";

export type InterviewItemView = {
  id: string;
  ordinal: number;
  total: number;
  kind: "story" | "year";
  question: string;
  hint: string | null;
  followUp: boolean;
};

export type InterviewState =
  | { kind: "start"; plannedCount: number }
  | { kind: "empty" }
  | { kind: "item"; item: InterviewItemView; resumed: boolean }
  | { kind: "summary"; answered: number; skipped: number; saved: string[] };

type Target = {
  eventId: string;
  label: string;
  kind: "story" | "year";
  question: string;
  followUp: boolean;
  topicOverride?: EpisodeTopic;
  isPeriodOverride?: boolean;
};

// 문항 키 → 대상 사건·질문. requireOpen=true 면 "아직 물을 이유가 있는지"까지 본다
// (문항을 낼 때). 서버 액션(이야기 턴·마무리·연도 답)은 대상 정보만 필요해 false.
async function resolveTarget(userId: string, itemKey: string, requireOpen: boolean): Promise<Target | null> {
  const parsed = parseItemKey(itemKey);
  if (!parsed) return null;

  if (parsed.source === "POOL") {
    const q = QUESTION_POOL.find((p) => p.id === parsed.id);
    if (!q || !q.enabled || q.anchor === null) return null;
    const ev = await prisma.lifeEvent.findFirst({
      where: { userId, type: q.anchor, status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, label: true, correctedLabel: true, year: true, correctedYear: true },
    });
    if (!ev) return null;
    return {
      eventId: ev.id,
      label: ev.correctedLabel ?? ev.label,
      kind: "story",
      question: q.text,
      followUp: q.followUp,
      topicOverride: { label: q.topic, year: ev.correctedYear ?? ev.year },
      isPeriodOverride: false,
    };
  }

  const ev = await getConfirmedLifeEvent(userId, parsed.id);
  if (!ev) return null;

  if (parsed.source === "GAP_YEAR") {
    if (ev.year !== null) return null; // 그사이 연도가 채워짐
    return { eventId: ev.id, label: ev.label, kind: "year", question: INTERVIEW_COPY.yearQuestion(ev.label), followUp: false };
  }

  if (requireOpen) {
    const episodes = await prisma.episode.findMany({
      where: { lifeEventId: ev.id },
      select: { content: true, isPeriod: true },
    });
    const open = !episodes.some(
      (ep) => (parsed.source === "GAP_PERIOD" ? ep.isPeriod : true) && isSubstantiveEpisodeContent(ep.content),
    );
    if (!open) return null;
  }

  if (parsed.source === "GAP_PERIOD") {
    const prompt = await getPeriodPromptForEvent(userId, ev.id);
    if (!prompt) return null;
    return {
      eventId: ev.id,
      label: ev.label,
      kind: "story",
      question: prompt.userPrompt,
      followUp: true,
      topicOverride: { label: `${ev.label} 이후`, year: ev.year },
    };
  }

  return {
    eventId: ev.id,
    label: ev.label,
    kind: "story",
    question: buildEpisodeOpeningPrompt(ev.type, ev.label),
    followUp: true,
  };
}

async function todayItems(userId: string, day: string): Promise<InterviewItem[]> {
  return prisma.interviewItem.findMany({ where: { userId, day }, orderBy: { ordinal: "asc" } });
}

async function summarize(rows: InterviewItem[]): Promise<InterviewState> {
  const answeredRows = rows.filter((r) => r.status === "ANSWERED");
  const refIds = answeredRows.map((r) => r.refId).filter((id): id is string => id !== null);
  const [episodes, events] = await Promise.all([
    prisma.episode.findMany({ where: { id: { in: refIds } }, select: { id: true, memory: { select: { title: true } } } }),
    prisma.lifeEvent.findMany({
      where: { id: { in: refIds } },
      select: { id: true, label: true, correctedLabel: true, year: true, correctedYear: true },
    }),
  ]);
  const saved: string[] = [];
  for (const r of answeredRows) {
    const ep = episodes.find((e) => e.id === r.refId);
    if (ep) {
      saved.push(ep.memory.title);
      continue;
    }
    const ev = events.find((e) => e.id === r.refId);
    const year = ev ? (ev.correctedYear ?? ev.year) : null;
    if (ev && year !== null) saved.push(INTERVIEW_COPY.summaryYearItem(ev.correctedLabel ?? ev.label, year));
  }
  return {
    kind: "summary",
    answered: answeredRows.length,
    skipped: rows.filter((r) => r.status === "SKIPPED").length,
    saved,
  };
}

// 오늘 다음 문항(없으면 요약). 더 이상 유효하지 않은 문항은 DROPPED 로 넘긴다.
export async function nextInterviewState(userId: string, now: Date = new Date()): Promise<InterviewState> {
  const rows = await todayItems(userId, kstDay(now));
  if (rows.length === 0) return { kind: "empty" };
  for (const row of rows) {
    if (row.status !== "PLANNED") continue;
    const target = await resolveTarget(userId, row.itemKey, true);
    if (!target) {
      await prisma.interviewItem.updateMany({
        where: { id: row.id, status: "PLANNED" },
        data: { status: "DROPPED", doneAt: now },
      });
      row.status = "DROPPED";
      continue;
    }
    if (!row.askedAt) {
      await prisma.interviewItem.update({ where: { id: row.id }, data: { askedAt: now } });
    }
    return {
      kind: "item",
      item: {
        id: row.id,
        ordinal: row.ordinal,
        total: rows.length,
        kind: target.kind,
        question: target.question,
        hint: target.kind === "year" ? INTERVIEW_COPY.yearHint : null,
        followUp: target.followUp,
      },
      resumed: false,
    };
  }
  return summarize(rows);
}

// /interview 첫 화면. 오늘 세션이 없으면 계획만 계산해 문항 수를 보여준다(저장은
// 시작 버튼 때). 있으면 이어서 — 이미 본 문항이 있으면 resumed.
export async function getInitialInterviewState(userId: string, now: Date = new Date()): Promise<InterviewState> {
  const day = kstDay(now);
  const rows = await prisma.interviewItem.findMany({ where: { userId, day }, select: { askedAt: true } });
  if (rows.length === 0) {
    const plan = await computeTodayPlan(userId, day);
    return plan.length > 0 ? { kind: "start", plannedCount: plan.length } : { kind: "empty" };
  }
  const state = await nextInterviewState(userId, now);
  if (state.kind === "item") return { ...state, resumed: rows.some((r) => r.askedAt !== null) };
  return state;
}

// 시작 버튼. 하루 1세션(Q7) — 오늘 문항이 이미 있으면 새로 만들지 않는다. 두 탭 동시
// 시작은 (userId, day, ordinal) 유니크 + skipDuplicates 로 한 벌만 남는다.
export async function startInterviewSession(userId: string, now: Date = new Date()): Promise<InterviewState> {
  const day = kstDay(now);
  const existing = await prisma.interviewItem.count({ where: { userId, day } });
  if (existing === 0) {
    const plan = await computeTodayPlan(userId, day);
    if (plan.length === 0) return { kind: "empty" };
    await prisma.interviewItem.createMany({
      data: plan.map((c, i) => ({ userId, day, ordinal: i + 1, itemKey: c.itemKey, source: c.source })),
      skipDuplicates: true,
    });
  }
  return nextInterviewState(userId, now);
}

async function ownedPlannedItem(userId: string, itemId: string): Promise<InterviewItem | null> {
  return prisma.interviewItem.findFirst({ where: { id: itemId, userId, status: "PLANNED" } });
}

async function addUsage(itemId: string, usage: AiUsage): Promise<void> {
  if (usage.calls === 0) return;
  await prisma.interviewItem.update({
    where: { id: itemId },
    data: {
      aiCalls: { increment: usage.calls },
      aiInputTokens: { increment: usage.inputTokens },
      aiOutputTokens: { increment: usage.outputTokens },
      aiModel: usage.model,
    },
  });
}

export async function skipInterviewItem(userId: string, itemId: string, now: Date = new Date()): Promise<InterviewState> {
  await prisma.interviewItem.updateMany({
    where: { id: itemId, userId, status: "PLANNED" },
    data: { status: "SKIPPED", doneAt: now },
  });
  return nextInterviewState(userId, now);
}

// 이야기형 문항의 후속 질문 한 턴(최대 2개 — MAX_FOLLOWUPS, Q3).
export async function interviewStoryTurn(
  userId: string,
  itemId: string,
  history: EpisodeTurn[],
  followUpCount: number,
): Promise<ContinueEpisodeResult> {
  const row = await ownedPlannedItem(userId, itemId);
  const target = row ? await resolveTarget(userId, row.itemKey, false) : null;
  if (!row || !target || target.kind !== "story") return { ok: false, error: INTERVIEW_COPY.errorGeneric };
  const usage = newAiUsage();
  try {
    return await trackAiUsage(usage, () =>
      continueEpisodeChatCore(userId, target.eventId, history, followUpCount, target.topicOverride),
    );
  } finally {
    await addUsage(row.id, usage);
  }
}

export type FinishInterviewStoryResult = { ok: true } | { ok: false; error: string };

// 이야기형 문항 마무리 — transcript(오프닝 질문 포함)를 기존 경로로 저장하고 ANSWERED.
export async function finishInterviewStory(
  userId: string,
  itemId: string,
  transcript: EpisodeTurn[],
  now: Date = new Date(),
): Promise<FinishInterviewStoryResult> {
  const row = await ownedPlannedItem(userId, itemId);
  const target = row ? await resolveTarget(userId, row.itemKey, false) : null;
  if (!row || !target || target.kind !== "story") return { ok: false, error: INTERVIEW_COPY.errorGeneric };
  const usage = newAiUsage();
  let result: FinishEpisodeResult;
  try {
    result = await trackAiUsage(usage, () =>
      finishEpisodeChatCore(userId, target.eventId, transcript, undefined, target.topicOverride, target.isPeriodOverride),
    );
  } finally {
    await addUsage(row.id, usage);
  }
  if (!result.ok) return { ok: false, error: INTERVIEW_COPY.saveFailed };
  const answers = transcript.filter((t) => t.role === "user");
  await prisma.interviewItem.updateMany({
    where: { id: row.id, status: "PLANNED" },
    data: {
      status: "ANSWERED",
      doneAt: now,
      turns: answers.length,
      answerChars: answers.reduce((n, t) => n + [...t.text].length, 0),
      refId: result.episodeId,
    },
  });
  return { ok: true };
}

export type YearAnswerResult =
  | { outcome: "saved"; label: string; year: number }
  | { outcome: "retry" }
  | { outcome: "unknown" }
  | { outcome: "gone" };

// 연도 문항 답. text=null 은 "기억이 안 나요" 버튼. 못 알아들으면 1번만 다시 묻고
// (turns 로 판단), 그래도 안 되면 모름으로 기록(refId=null — 재노출 규칙 Q5).
export async function answerInterviewYear(
  userId: string,
  itemId: string,
  text: string | null,
  now: Date = new Date(),
): Promise<YearAnswerResult> {
  const row = await ownedPlannedItem(userId, itemId);
  const target = row ? await resolveTarget(userId, row.itemKey, false) : null;
  if (!row || !target || target.kind !== "year") return { outcome: "gone" };

  const answer = text?.trim() ?? "";
  if (answer) {
    await prisma.interviewItem.update({
      where: { id: row.id },
      data: { turns: { increment: 1 }, answerChars: { increment: [...answer].length } },
    });
  }
  const markAnswered = (refId: string | null) =>
    prisma.interviewItem.updateMany({
      where: { id: row.id, status: "PLANNED" },
      data: { status: "ANSWERED", doneAt: now, refId },
    });

  const birthYear = answer ? await birthYearOf(userId) : null;
  let year = answer ? parseYearDeterministic(answer, birthYear, now) : null;
  if (year === null && answer && !isUnknownYearAnswer(answer)) {
    const usage = newAiUsage();
    try {
      year = await trackAiUsage(usage, () => parseYearWithAi(answer, birthYear, now));
    } finally {
      await addUsage(row.id, usage);
    }
    if (year === null && row.turns === 0) return { outcome: "retry" };
  }

  if (year === null) {
    await markAnswered(null);
    return { outcome: "unknown" };
  }
  // 원래 null 인 확정 사건에만 연도를 채운다 — 데이터는 year 하나(status·correctedYear 등 무변).
  const written = await prisma.lifeEvent.updateMany({
    where: { id: target.eventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] }, year: null, correctedYear: null },
    data: { year },
  });
  if (written.count === 0) {
    await prisma.interviewItem.updateMany({
      where: { id: row.id, status: "PLANNED" },
      data: { status: "DROPPED", doneAt: now },
    });
    return { outcome: "gone" };
  }
  await markAnswered(target.eventId);
  return { outcome: "saved", label: target.label, year };
}

async function birthYearOf(userId: string): Promise<number | null> {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { birthYear: true } });
  return profile?.birthYear ?? null;
}

// /story-review 진입 카드 — 오늘 기록만 1회 조회(계획 계산 없음).
export type InterviewCardState =
  | { kind: "before" }
  | { kind: "progress"; done: number; total: number }
  | { kind: "done" };

export async function getInterviewCardState(userId: string, now: Date = new Date()): Promise<InterviewCardState> {
  const rows = await prisma.interviewItem.findMany({ where: { userId, day: kstDay(now) }, select: { status: true } });
  if (rows.length === 0) return { kind: "before" };
  const done = rows.filter((r) => r.status !== "PLANNED").length;
  return done === rows.length ? { kind: "done" } : { kind: "progress", done, total: rows.length };
}
