// 오늘의 인터뷰 — 오늘 문항 계획(docs/phase/today-interview.md §2·§3). 1차 범위.
//
// 출처: 갭 이야기(episode·time_gap) · 연도 없는 확정 사건 · 질문 풀(대상 시기 있는 것만) ·
// "관계별 나"(SELF, 노드 그래프 2a — 최대 1개). 이어가기·인물 갭은 2차. 계산은 세션 시작 때
// 1회(detectGaps 가 무겁다 — P20).
// pickPlan·isEligible·poolCandidates·selfCandidates 는 순수 함수(db/test-interview.ts 가 직접 검증).

import { prisma } from "../db";
import { detectGaps } from "../gap-detector";
import type { LifeEventType } from "../generated/prisma/enums";
import { daysBetween, itemKeyOf, selfKeyId, type InterviewSource, type SelfRelationRef } from "./keys";
import {
  QUESTION_POOL,
  SELF_QUESTION_POOL,
  type InterviewPoolQuestion,
  type InterviewSelfQuestion,
} from "./question-pool";

export const SESSION_SIZE = 6; // Q2

type Kind = "GAP_YEAR" | "GAP" | "POOL" | "SELF";
const KIND_LIMIT: Record<Kind, number> = { GAP_YEAR: 2, GAP: 3, POOL: 3, SELF: 1 }; // SELF 최대 1개(노드 그래프 Q10)
// 가벼운 연도로 시작해 무거운 이야기 사이에 취향을 끼운다(§2.3). "관계별 나"는 뒤쪽 한 자리
// (후보가 없으면 건너뛰어 기존 순서 그대로). 빈 자리는 취향→갭→연도 순.
const BASE_PATTERN: Kind[] = ["GAP_YEAR", "GAP", "POOL", "GAP", "SELF", "POOL"];
const FILL_ORDER: Kind[] = ["POOL", "GAP", "GAP_YEAR"];

export type PlanCandidate = {
  itemKey: string;
  source: InterviewSource;
  eventId: string;
  category?: InterviewPoolQuestion["category"];
};

export type PlanHistoryRow = { itemKey: string; status: string; refId: string | null; day: string };

// 재노출 규칙(Q4·Q5). 오늘 이전 기록만 본다. DROPPED·PLANNED(중간 이탈)는 영향 없음.
//   답한 풀 질문·관계별 나 → 영구 제외
//   건너뜀 1회 → 7일 / 2회 → 30일 / 3회 → 영구 제외
//   연도 "모름"(답했는데 연도 미저장) 1회 → 14일 / 2회 → 영구 제외
//   답했지만 갭이 남은 이야기(실질 내용 아님) → 7일
export function isEligible(
  itemKey: string,
  source: InterviewSource,
  history: PlanHistoryRow[],
  today: string,
): boolean {
  const rows = history.filter(
    (h) => h.itemKey === itemKey && h.day < today && (h.status === "ANSWERED" || h.status === "SKIPPED"),
  );
  if (rows.length === 0) return true;
  if ((source === "POOL" || source === "SELF") && rows.some((r) => r.status === "ANSWERED")) return false;
  const skips = rows.filter((r) => r.status === "SKIPPED").length;
  if (skips >= 3) return false;
  if (source === "GAP_YEAR" && rows.filter((r) => r.status === "ANSWERED" && r.refId === null).length >= 2) {
    return false;
  }
  const last = rows.reduce((a, b) => (b.day > a.day ? b : a));
  const wait = last.status === "SKIPPED" ? (skips === 1 ? 7 : 30) : source === "GAP_YEAR" ? 14 : 7;
  return daysBetween(last.day, today) >= wait;
}

// 대상 시기 사건이 확정인 풀 질문만(SKIPPED=해당 없음 시기는 안 묻는다).
// 노드 그래프 1단계 — 같은 유형 사건이 여러 개(두 번째 직장 등)일 수 있다. 풀 질문은 질문당
// 1번만 내고, 대상은 순서상 첫 사건(목록 [0] — sequenceOrder·id 순, session.ts resolveTarget
// 과 같은 기준).
export function poolCandidates(
  pool: InterviewPoolQuestion[],
  confirmedEventsByType: Map<LifeEventType, readonly string[]>,
): PlanCandidate[] {
  return pool
    .filter((q) => q.enabled && q.anchor !== null && (confirmedEventsByType.get(q.anchor)?.length ?? 0) > 0)
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      itemKey: itemKeyOf("POOL", q.id),
      source: "POOL" as const,
      eventId: (confirmedEventsByType.get(q.anchor as LifeEventType) as readonly string[])[0],
      category: q.category,
    }));
}

// "관계별 나" 후보 — 대상 시기(anchor 유형의 첫 확정 사건, 풀과 같은 기준)마다
// 범주 문항은 1개, linked 문항은 그 사건에 연결된 인물·그룹마다 1개.
export function selfCandidates(
  pool: InterviewSelfQuestion[],
  confirmedEventsByType: Map<LifeEventType, readonly string[]>,
  relationsByEvent: Map<string, readonly SelfRelationRef[]>,
): PlanCandidate[] {
  return pool
    .filter((q) => q.enabled)
    .sort((a, b) => a.order - b.order)
    .flatMap((q) => {
      const eventId = confirmedEventsByType.get(q.anchor)?.[0];
      if (!eventId) return [];
      const relations: (SelfRelationRef | null)[] =
        q.relation.kind === "category" ? [null] : [...(relationsByEvent.get(eventId) ?? [])];
      return relations.map((r) => ({
        itemKey: itemKeyOf("SELF", selfKeyId(q.id, eventId, r)),
        source: "SELF" as const,
        eventId,
      }));
    });
}

export function pickPlan(
  candidates: { years: PlanCandidate[]; gaps: PlanCandidate[]; pools: PlanCandidate[]; selves: PlanCandidate[] },
  history: PlanHistoryRow[],
  today: string,
  size: number = SESSION_SIZE,
): PlanCandidate[] {
  const eligible = (c: PlanCandidate) => isEligible(c.itemKey, c.source, history, today);
  const queues: Record<Kind, PlanCandidate[]> = {
    GAP_YEAR: candidates.years.filter(eligible),
    GAP: candidates.gaps.filter(eligible),
    POOL: candidates.pools.filter(eligible),
    SELF: candidates.selves.filter(eligible),
  };
  const picked: PlanCandidate[] = [];
  const count: Record<Kind, number> = { GAP_YEAR: 0, GAP: 0, POOL: 0, SELF: 0 };
  const usedGapEvents = new Set<string>(); // 같은 세션에 같은 사건 이야기 두 번 금지
  let lastPoolCategory: string | undefined; // 같은 분류 연속 금지(대안 없으면 허용)

  const take = (kind: Kind): boolean => {
    if (picked.length >= size || count[kind] >= KIND_LIMIT[kind]) return false;
    const q = queues[kind];
    let idx = 0;
    if (kind === "GAP") idx = q.findIndex((c) => !usedGapEvents.has(c.eventId));
    if (kind === "POOL") {
      const other = q.findIndex((c) => c.category !== lastPoolCategory);
      idx = other >= 0 ? other : 0;
    }
    if (idx < 0 || idx >= q.length) return false;
    const [c] = q.splice(idx, 1);
    picked.push(c);
    count[kind] += 1;
    if (kind === "GAP") usedGapEvents.add(c.eventId);
    if (kind === "POOL") lastPoolCategory = c.category;
    return true;
  };

  for (const kind of BASE_PATTERN) take(kind);
  for (const kind of FILL_ORDER) while (take(kind));
  return picked;
}

export async function computeTodayPlan(userId: string, today: string): Promise<PlanCandidate[]> {
  const [gaps, events, history] = await Promise.all([
    detectGaps(userId),
    prisma.lifeEvent.findMany({
      where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
      orderBy: [{ sequenceOrder: "asc" }, { id: "asc" }],
      select: { id: true, type: true, year: true, correctedYear: true },
    }),
    prisma.interviewItem.findMany({
      where: { userId, day: { lt: today } },
      select: { itemKey: true, status: true, refId: true, day: true },
    }),
  ]);

  const gapCandidates: PlanCandidate[] = [];
  for (const g of gaps) {
    if (!g.targetEventId) continue;
    if (g.type === "time_gap") {
      gapCandidates.push({ itemKey: itemKeyOf("GAP_PERIOD", g.targetEventId), source: "GAP_PERIOD", eventId: g.targetEventId });
    } else if (g.type === "episode") {
      gapCandidates.push({ itemKey: itemKeyOf("GAP_EPISODE", g.targetEventId), source: "GAP_EPISODE", eventId: g.targetEventId });
    }
  }

  const years: PlanCandidate[] = events
    .filter((e) => (e.correctedYear ?? e.year) === null)
    .map((e) => ({ itemKey: itemKeyOf("GAP_YEAR", e.id), source: "GAP_YEAR", eventId: e.id }));

  const eventsByType = new Map<LifeEventType, string[]>();
  for (const e of events) eventsByType.set(e.type, [...(eventsByType.get(e.type) ?? []), e.id]);

  const relationsByEvent = await linkedRelations(userId, events.map((e) => e.id));
  return pickPlan(
    {
      years,
      gaps: gapCandidates,
      pools: poolCandidates(QUESTION_POOL, eventsByType),
      selves: selfCandidates(SELF_QUESTION_POOL, eventsByType, relationsByEvent),
    },
    history,
    today,
  );
}

// 사건별 연결된 관계 대상 — 확정 인물(PersonLifeEvent, subjectType=person·isDraft=false) 다음
// 확정 그룹 연결(NodeLink LIFE_EVENT→PERSON_GROUP, CONFIRMED). 각각 연결 생성 순.
async function linkedRelations(userId: string, eventIds: string[]): Promise<Map<string, SelfRelationRef[]>> {
  const [people, groups] = await Promise.all([
    prisma.personLifeEvent.findMany({
      where: { userId, lifeEventId: { in: eventIds }, person: { userId, subjectType: "person", isDraft: false } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { lifeEventId: true, personId: true },
    }),
    prisma.nodeLink.findMany({
      where: { userId, fromType: "LIFE_EVENT", fromId: { in: eventIds }, toType: "PERSON_GROUP", status: "CONFIRMED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { fromId: true, toId: true },
    }),
  ]);
  const map = new Map<string, SelfRelationRef[]>();
  const add = (eventId: string, r: SelfRelationRef) => map.set(eventId, [...(map.get(eventId) ?? []), r]);
  for (const p of people) add(p.lifeEventId, { type: "PERSON", id: p.personId });
  for (const g of groups) add(g.fromId, { type: "PERSON_GROUP", id: g.toId });
  return map;
}
