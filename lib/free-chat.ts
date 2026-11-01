// My Life 개편 2단계 — /chat-v3 자유 대화 구간. docs/phase/my-life-restructure.md §3.1~§3.5.
// 순수 모듈(auth 없음) — app/actions/free-chat.ts 가 auth 만 씌우고, 회귀(db/test-chat-proposal.ts)가
// 같은 함수를 userId 로 부른다.
//
// 구간 = ChatV3Segment.startedAt 이후의 채팅 로그(OnboardingChatMessage — 클라가 턴마다 저장, 이 모듈은
// 읽기만). 응답 호출 1회가 답 + 구간 판정(continue/done/topic_shift)을 함께 돌려주고(사용자 전역 모델 —
// Q62), 코드가 하한·상한으로 제안 시점을 정한다:
//   - topic_shift: 앞 이야기(본인 실질 1턴 이상)를 방금 턴 직전까지로 제안, 방금 턴은 새 구간의 첫 턴
//   - 본인 실질 6턴: 무조건 제안(Q64)
//   - 마무리 말("그 정도예요"): 실질 1턴 이상이면 제안
//   - done: 실질 2턴 이상이면 제안(인사·맞장구로 카드가 뜨지 않게)
// 카드가 떠 있는 동안에는 새 제안을 만들지 않는다(대화는 계속). 결정하면 구간이 카드가 다룬 마지막 턴
// 뒤로 옮겨져 그 뒤 대화가 다음 구간이 된다. 자유 발화로 중심을 바로 만드는 동작은 없다(§3.1 — 중심은
// [만들기] 때만).

import { chat } from "./ai";
import { isOverDailyBudget, recordChatUsage } from "./chat-v3-usage";
import { prisma } from "./db";
import { buildEpisodeOpeningPrompt, buildPersonAskPrompt } from "./episode-opening";
import { isEpisodeDoneIntent, isExitIntent, stripEpisodeDoneSignal } from "./episode-text";
import { getPeriodPromptForEvent } from "./gap-detector";
import { Prisma } from "./generated/prisma/client";
import {
  buildProposal,
  cardToEdit,
  createFromCard,
  parseCard,
  type CardEdit,
  type CreateFromCardResult,
  type ProposalCard,
  type TranscriptTurn,
} from "./node-proposal";
import { getPersonEpisodeTarget } from "./person-chat";
import { buildPersonAddress, buildPersonLabel } from "./person-honorific";
import { buildFreeChatReplySystemPrompt } from "./prompts/free-chat";
import { resolveLiveModel } from "./user-ai-model";

export const SEGMENT_MAX_USER_TURNS = 6;
// 마지막 활동 7일이 지난 구간은 재진입 때 바로 제안으로 마무리 권유(Q66).
export const STALE_SEGMENT_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_TITLES_MAX = 2;
const SEGMENT_MESSAGES_MAX = 80;
const REPLY_FALLBACK = "네, 이야기 잘 듣고 있어요.";

export type FreeTopicKind = "episode" | "period" | "person" | "person_episode";
export type FreeTopicInput = { eventId: string; kind: FreeTopicKind; personId?: string | null };

type SegmentRow = {
  startedAt: Date;
  topicEventId: string | null;
  topicPersonId: string | null;
  topicGapType: string | null;
  proposal: Prisma.JsonValue | null;
  recentTitles: string[];
  updatedAt: Date;
};

async function getSegment(userId: string): Promise<SegmentRow> {
  return prisma.chatV3Segment.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: {
      startedAt: true,
      topicEventId: true,
      topicPersonId: true,
      topicGapType: true,
      proposal: true,
      recentTitles: true,
      updatedAt: true,
    },
  });
}

type LogTurn = { role: "user" | "assistant"; content: string; createdAt: Date };

async function logTurns(userId: string, from: Date, until?: Date): Promise<LogTurn[]> {
  const rows = await prisma.onboardingChatMessage.findMany({
    where: { userId, createdAt: { gte: from, ...(until ? { lt: until } : {}) } },
    orderBy: { createdAt: "desc" },
    take: SEGMENT_MESSAGES_MAX,
    select: { role: true, content: true, createdAt: true },
  });
  return rows.reverse().map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content, createdAt: r.createdAt }));
}

// 본인 실질 턴 — 마무리 말·종료 말뿐인 턴은 세지 않는다.
export function substantiveUserTurns(turns: { role: string; content: string }[]): number {
  return turns.filter((t) => t.role === "user" && !isExitIntent(t.content) && stripEpisodeDoneSignal(t.content)).length;
}

export type ProposeAt = { until: string | null } | null;

// 응답 뒤 제안 여부(순수 — 회귀가 직접 부른다). last = 방금 본인 턴.
export function decideProposal(
  segment: "continue" | "done" | "topic_shift",
  turns: { role: string; content: string; createdAt: Date }[],
): ProposeAt {
  const s = substantiveUserTurns(turns);
  const users = turns.filter((t) => t.role === "user");
  const last = users[users.length - 1];
  if (!last) return null;
  const lastSubstantive = !isExitIntent(last.content) && !!stripEpisodeDoneSignal(last.content);
  if (segment === "topic_shift" && s - (lastSubstantive ? 1 : 0) >= 1 && lastSubstantive) {
    return { until: last.createdAt.toISOString() };
  }
  if (s >= SEGMENT_MAX_USER_TURNS) return { until: null };
  if (isEpisodeDoneIntent(last.content) && s >= 1) return { until: null };
  if (segment === "done" && s >= 2) return { until: null };
  return null;
}

// 모델 입력 — 같은 역할이 이어지면 합치고, 첫 턴이 본인이 되게(첫 AI 말은 시스템 참고로).
function toModelMessages(turns: LogTurn[]): { messages: { role: "user" | "assistant"; content: string }[]; opening: string | null } {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let opening: string | null = null;
  for (const t of turns) {
    if (out.length === 0 && t.role === "assistant") {
      opening = opening ? `${opening}\n${t.content}` : t.content;
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content = `${prev.content}\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  return { messages: out, opening };
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

type TopicInfo = { label: string | null; centerId: string | null; targetPersonId: string | null; isPeriod: boolean };

async function topicInfo(userId: string, seg: Pick<SegmentRow, "topicEventId" | "topicPersonId" | "topicGapType">): Promise<TopicInfo> {
  if (!seg.topicEventId) return { label: null, centerId: null, targetPersonId: null, isPeriod: false };
  const ev = await prisma.lifeEvent.findFirst({
    where: { id: seg.topicEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, label: true, correctedLabel: true, year: true, correctedYear: true },
  });
  if (!ev) return { label: null, centerId: null, targetPersonId: null, isPeriod: false };
  const label = ev.correctedLabel ?? ev.label;
  const year = ev.correctedYear ?? ev.year;
  const base = `${year ? `${year} ` : ""}${label}`;
  if (seg.topicGapType === "period") return { label: `${base} 이후`, centerId: ev.id, targetPersonId: null, isPeriod: true };
  if (seg.topicGapType === "person_episode" && seg.topicPersonId) {
    const p = await prisma.person.findFirst({ where: { id: seg.topicPersonId, userId }, select: { id: true, name: true, relation: true } });
    if (p) return { label: `${base} — ${buildPersonLabel(p.name, p.relation)} 이야기`, centerId: ev.id, targetPersonId: p.id, isPeriod: false };
  }
  if (seg.topicGapType === "person") return { label: `${base} — 그 시절 가까이 지낸 분`, centerId: ev.id, targetPersonId: null, isPeriod: false };
  return { label: base, centerId: ev.id, targetPersonId: null, isPeriod: false };
}

async function birthYearOf(userId: string): Promise<number | null> {
  const [p, u] = await Promise.all([
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { birthYear: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } }),
  ]);
  return p?.birthYear ?? u?.birthYear ?? null;
}

// ─── 화면에 보내는 값 ───────────────────────────────────────────────────

export type CenterOption = { id: string; label: string; year: number | null };
export type ProposalView = { card: Omit<ProposalCard, "transcript">; centers: CenterOption[] };

export async function centerOptions(userId: string): Promise<CenterOption[]> {
  const rows = await prisma.lifeEvent.findMany({
    where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, label: true, correctedLabel: true, year: true, correctedYear: true },
  });
  return rows.map((r) => ({ id: r.id, label: r.correctedLabel ?? r.label, year: r.correctedYear ?? r.year }));
}

export async function toView(userId: string, card: ProposalCard): Promise<ProposalView> {
  const { transcript: _omit, ...rest } = card;
  void _omit;
  return { card: rest, centers: card.centerFixed ? [] : await centerOptions(userId) };
}

export type FreeChatState = {
  proposal: ProposalView | null;
  // 지금 구간의 본인 실질 턴 수(갭 칩·[지금 이야기 남기기] 표시용).
  segmentTurns: number;
  // 마지막 활동 7일이 지난 구간(카드 없음, 내용 있음) — 화면이 바로 제안을 부른다(Q66).
  stale: boolean;
};

export async function getFreeChatState(userId: string, now: Date = new Date()): Promise<FreeChatState> {
  const seg = await getSegment(userId);
  const card = parseCard(seg.proposal);
  const turns = await logTurns(userId, card?.until ? new Date(card.until) : seg.startedAt);
  const segmentTurns = substantiveUserTurns(turns);
  const last = turns[turns.length - 1]?.createdAt ?? seg.updatedAt;
  return {
    proposal: card ? await toView(userId, card) : null,
    segmentTurns,
    stale: !card && segmentTurns > 0 && now.getTime() - last.getTime() > STALE_SEGMENT_MS,
  };
}

// ─── 주제(갭 칩·딥링크) ────────────────────────────────────────────────

export type StartTopicResult = { kind: "opening"; announce: string; opening: string } | { kind: "pending" } | { kind: "gone" };

// 주제로 새 구간 시작 — 카드가 떠 있으면 시작하지 않는다(카드부터 결정). 오프닝 질문은 기존 템플릿.
// 주제 고른 말(본인 버블)과 오프닝을 여기서 순서대로 로그에 저장한다(화면은 보여 주기만): 고른 말 → 구간 시작
// → 오프닝. 그래서 "~ 이야기도 해볼게요"는 구간 밖(본인 실질 턴·제안 입력에 안 섞임), 오프닝부터 구간.
export async function startFreeTopic(
  userId: string,
  topic: FreeTopicInput,
  sessionId: string,
): Promise<StartTopicResult> {
  const seg = await getSegment(userId);
  if (parseCard(seg.proposal)) return { kind: "pending" };
  const ev = await prisma.lifeEvent.findFirst({
    where: { id: topic.eventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, type: true, label: true, correctedLabel: true },
  });
  if (!ev) return { kind: "gone" };
  const label = ev.correctedLabel ?? ev.label;
  let opening: string | null = null;
  let announce = `${label} 이야기도 해볼게요`;
  let personId: string | null = null;
  if (topic.kind === "episode") opening = buildEpisodeOpeningPrompt(ev.type, label);
  else if (topic.kind === "person") {
    opening = buildPersonAskPrompt(ev.type, label);
    announce = `${label} 시절 이야기도 해볼게요`;
  } else if (topic.kind === "period") {
    const prompt = await getPeriodPromptForEvent(userId, ev.id);
    opening = prompt?.userPrompt ?? null;
    if (prompt) announce = prompt.announceText;
  } else if (topic.kind === "person_episode" && topic.personId) {
    const t = await getPersonEpisodeTarget(userId, ev.id, topic.personId);
    if (t) {
      opening = `${buildPersonAddress(t.personName, t.personRelation)} 기억나는 일 있으세요?`;
      announce = `${buildPersonAddress(t.personName, t.personRelation)} 있었던 이야기 해볼게요`;
      personId = topic.personId;
    }
  }
  if (!opening) return { kind: "gone" };
  // 경계는 메시지 시각 기준(서버 인스턴스 시계 차이와 무관하게) — 고른 말 바로 뒤, 오프닝은 그 뒤.
  const picked = await prisma.onboardingChatMessage.create({
    data: { userId, sessionId, role: "user", content: announce },
    select: { createdAt: true },
  });
  const startedAt = new Date(picked.createdAt.getTime() + 1);
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { startedAt, topicEventId: ev.id, topicGapType: topic.kind, topicPersonId: personId },
  });
  await prisma.onboardingChatMessage.create({
    data: { userId, sessionId, role: "assistant", content: opening, createdAt: new Date(startedAt.getTime() + 1) },
  });
  return { kind: "opening", announce, opening };
}

// ─── 응답 ───────────────────────────────────────────────────────────────

export type FreeChatReplyResult =
  | { kind: "budget" }
  | { kind: "reply"; reply: string; propose: ProposeAt; segmentTurns: number; cardPending: boolean };

// 방금 본인 턴(화면이 이미 로그에 저장)에 대한 응답 + 제안 시점.
export async function freeChatReply(userId: string): Promise<FreeChatReplyResult> {
  if (await isOverDailyBudget()) return { kind: "budget" };
  const seg = await getSegment(userId);
  const card = parseCard(seg.proposal);
  // 카드가 떠 있으면 그 카드 뒤 대화만 맥락으로(카드가 다룬 이야기를 또 묻지 않게).
  const from = card?.until ? new Date(card.until) : seg.startedAt;
  const turns = await logTurns(userId, from);
  const [topic, birthYear, live] = await Promise.all([topicInfo(userId, seg), birthYearOf(userId), resolveLiveModel(userId)]);

  const { messages, opening } = toModelMessages(turns);
  let reply = REPLY_FALLBACK;
  let segment: "continue" | "done" | "topic_shift" = "continue";
  if (messages.length > 0) {
    const system =
      buildFreeChatReplySystemPrompt({
        birthYear,
        topic: topic.label,
        recentTitles: [...(card ? [card.title] : []), ...seg.recentTitles].slice(0, RECENT_TITLES_MAX),
      }) + (opening ? `\n\n대화를 시작한 말: "${opening}"` : "");
    try {
      const res = await chat(messages, { system, model: live.model, maxTokens: 400, temperature: 0.6 });
      await recordChatUsage(userId, "REPLY", res);
      const parsed = JSON.parse(stripJsonFence(res.text).match(/\{[\s\S]*\}/)?.[0] ?? "") as { reply?: unknown; segment?: unknown };
      if (typeof parsed.reply === "string" && parsed.reply.trim()) reply = parsed.reply.trim();
      if (parsed.segment === "done" || parsed.segment === "topic_shift") segment = parsed.segment;
    } catch (e) {
      console.error("[free-chat] reply", e instanceof Error ? e.message : e);
    }
  }
  return {
    kind: "reply",
    reply,
    propose: card ? null : decideProposal(segment, turns),
    segmentTurns: substantiveUserTurns(turns),
    cardPending: !!card,
  };
}

// ─── 제안 ───────────────────────────────────────────────────────────────

export type ProposeResult =
  | { kind: "card"; view: ProposalView }
  | { kind: "none"; segmentTurns: number }
  | { kind: "budget" };

// 지금 구간(또는 until 직전까지)을 제안 카드로. 이미 카드가 있으면 그 카드.
// 본인 이야기 내용이 없으면 카드 없이 구간만 넘긴다(같은 인사로 또 제안하지 않게).
export async function proposeFromSegment(
  userId: string,
  opts: { until?: string | null } = {},
  now: Date = new Date(),
): Promise<ProposeResult> {
  const seg = await getSegment(userId);
  const existing = parseCard(seg.proposal);
  if (existing) return { kind: "card", view: await toView(userId, existing) };

  // 경계 = 구간 마지막 메시지 바로 뒤(서버 시계가 아니라 메시지 시각 기준 — 인스턴스 시계 차이로 다음 턴이
  // 경계 앞에 찍히지 않게). topic_shift 면 방금 본인 턴 직전까지(그 턴은 다음 구간의 첫 턴).
  let until: Date | null = null;
  if (opts.until) {
    const t = new Date(opts.until);
    if (!Number.isNaN(t.getTime()) && t > seg.startedAt) until = t;
  }
  const all = await logTurns(userId, seg.startedAt);
  until ??= all.length ? new Date(all[all.length - 1].createdAt.getTime() + 1) : now;
  const turns = all.filter((t) => t.createdAt < until);
  if (substantiveUserTurns(turns) === 0) {
    return { kind: "none", segmentTurns: substantiveUserTurns(await logTurns(userId, seg.startedAt)) };
  }
  if (await isOverDailyBudget(now)) return { kind: "budget" };

  const topic = await topicInfo(userId, seg);
  const result = await buildProposal(userId, {
    turns: turns.map((t): TranscriptTurn => ({ role: t.role, text: t.content })),
    topic: topic.label,
    centerId: topic.centerId,
    centerFixed: false,
    targetPersonId: topic.targetPersonId,
    isPeriod: topic.isPeriod,
    titleHint: null,
    until: until.toISOString(),
    purpose: "PROPOSAL",
  });
  if (result.kind !== "card") {
    // 내용 없음(또는 실패) — 이 구간은 넘긴다. 주제도 끝.
    await prisma.chatV3Segment.update({
      where: { userId },
      data: { startedAt: until, topicEventId: null, topicPersonId: null, topicGapType: null },
    });
    return { kind: "none", segmentTurns: substantiveUserTurns(await logTurns(userId, until)) };
  }
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { proposal: result.card as unknown as Prisma.InputJsonValue },
  });
  return { kind: "card", view: await toView(userId, result.card) };
}

export type DecideFreeChatResult =
  | (Extract<CreateFromCardResult, { ok: true }> & { segmentTurns: number })
  | Exclude<CreateFromCardResult, { ok: true }>
  | { ok: false; reason: "no_card" };

// [만들기] — edit 없으면 카드 그대로.
export async function createFromFreeChatProposal(userId: string, edit?: CardEdit): Promise<DecideFreeChatResult> {
  const seg = await getSegment(userId);
  const card = parseCard(seg.proposal);
  if (!card) return { ok: false, reason: "no_card" };
  const result = await createFromCard(userId, card, edit ?? cardToEdit(card));
  if (!result.ok) return result;
  const until = card.until ? new Date(card.until) : new Date();
  await prisma.chatV3Segment.update({
    where: { userId },
    data: {
      startedAt: until,
      proposal: Prisma.DbNull,
      recentTitles: [result.title, ...seg.recentTitles.filter((t) => t !== result.title)].slice(0, RECENT_TITLES_MAX),
      topicEventId: null,
      topicPersonId: null,
      topicGapType: null,
    },
  });
  return { ...result, segmentTurns: substantiveUserTurns(await logTurns(userId, until)) };
}

// [안 만들기] — 아무것도 저장 안 함. 같은 구간으로 다시 제안하지 않는다(구간을 카드 뒤로).
export async function declineFreeChatProposal(userId: string): Promise<{ segmentTurns: number }> {
  const seg = await getSegment(userId);
  const card = parseCard(seg.proposal);
  const until = card?.until ? new Date(card.until) : new Date();
  await prisma.chatV3Segment.update({
    where: { userId },
    data: { startedAt: until, proposal: Prisma.DbNull, topicEventId: null, topicPersonId: null, topicGapType: null },
  });
  return { segmentTurns: substantiveUserTurns(await logTurns(userId, until)) };
}

// 옛 대기 대화(ChatV3PendingContext — 개편 전 이야기·인물 단계)는 자유 대화 주제로 이어받고 지운다(§3.5).
export async function adoptLegacyPending(userId: string): Promise<boolean> {
  const pending = await prisma.chatV3PendingContext.findUnique({
    where: { userId },
    select: { stage: true, targetEventId: true, targetPersonId: true },
  });
  if (!pending) return false;
  await prisma.chatV3PendingContext.deleteMany({ where: { userId } });
  const seg = await getSegment(userId);
  if (parseCard(seg.proposal) || seg.topicEventId) return false;
  const kind: FreeTopicKind =
    pending.stage === "PERSON" ? "person" : pending.targetPersonId ? "person_episode" : "episode";
  await prisma.chatV3Segment.update({
    where: { userId },
    data: {
      topicEventId: pending.targetEventId,
      topicGapType: kind,
      topicPersonId: kind === "person_episode" ? pending.targetPersonId : null,
    },
  });
  return true;
}
