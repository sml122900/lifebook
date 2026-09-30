// 기억 에이전트 연구 트랙 — 시기 해석 컨텍스트 조립 (R1-6). 원본은 읽기만.
//
// resolvePeriod(lib/lab/period.ts)에 넘길 출생연도·본인 기록 앵커·건너뛴 단계·시대 사건.
//   출생연도: OnboardingProfile(v3) → User.birthYear → v2 BIRTH 사건 → v3 BIRTH 골격
//   앵커   : v3 골격 CONFIRMED·CORRECTED(정정 연도 우선)가 v2 기간 카테고리보다 우선.
//            시작 연도가 같으면 v2 의 끝 연도(endYear)는 살린다.
//            v3 UNCONFIRMED 연도는 시스템 추정값이라 쓰지 않는다.
//   건너뜀 : v3 SKIPPED 이면서 v2 기록도 없는 단계
//   시대   : MonthEvent VERIFIED(연도 있는 것) 제목·연도
// contextHash 가 바뀌면(예: 골격 연도 정정) 파생 연도 카드만 LLM 없이 다시 계산한다.

import { createHash } from "node:crypto";

import { prisma } from "../db";
import {
  LIFE_CATEGORY_STAGE,
  LIFE_EVENT_TYPE_STAGE,
  type LifeStage,
  type PeriodContext,
} from "./period";

export async function loadPeriodContext(
  userId: string,
): Promise<{ ctx: PeriodContext; contextHash: string }> {
  const [onboarding, user, skeleton, v2, eras] = await Promise.all([
    prisma.onboardingProfile.findUnique({
      where: { userId },
      select: { birthYear: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { birthYear: true },
    }),
    prisma.lifeEvent.findMany({
      where: { userId },
      select: { type: true, status: true, year: true, correctedYear: true },
    }),
    prisma.userMemory.findMany({
      where: {
        userId,
        createdVia: "life_event",
        isDraft: false,
        category: { not: null },
      },
      select: { category: true, eventYear: true, year: true, endYear: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.monthEvent.findMany({
      where: { confidence: "VERIFIED", year: { not: null } },
      select: { title: true, year: true },
    }),
  ]);

  const decided = (s: string) => s === "CONFIRMED" || s === "CORRECTED";
  const v2Birth = v2.find((m) => m.category === "BIRTH");
  const v3Birth = skeleton.find((e) => e.type === "BIRTH" && decided(e.status));
  const birthYear =
    onboarding?.birthYear ??
    user?.birthYear ??
    (v2Birth ? (v2Birth.eventYear ?? v2Birth.year) : null) ??
    (v3Birth ? (v3Birth.correctedYear ?? v3Birth.year) : null);

  const anchors: PeriodContext["anchors"] = {};
  // v2 기간 카테고리(같은 카테고리 여러 행이면 먼저 기록한 것).
  for (const m of v2) {
    const stage = m.category ? LIFE_CATEGORY_STAGE[m.category] : undefined;
    if (!stage || anchors[stage]) continue;
    anchors[stage] = {
      start: m.eventYear ?? m.year,
      ...(m.endYear !== null ? { end: m.endYear } : {}),
    };
  }
  // v3 확정 골격이 덮어쓴다(시작이 같으면 v2 끝 연도 유지).
  for (const e of skeleton) {
    const stage = LIFE_EVENT_TYPE_STAGE[e.type];
    const start = e.correctedYear ?? e.year;
    if (!stage || !decided(e.status) || start === null) continue;
    const prev = anchors[stage];
    anchors[stage] = {
      start,
      ...(prev && prev.start === start && prev.end !== undefined
        ? { end: prev.end }
        : {}),
    };
  }
  const skipped: LifeStage[] = [];
  for (const e of skeleton) {
    const stage = LIFE_EVENT_TYPE_STAGE[e.type];
    if (
      stage &&
      e.status === "SKIPPED" &&
      !anchors[stage] &&
      !skipped.includes(stage)
    )
      skipped.push(stage);
  }

  const ctx: PeriodContext = {
    birthYear,
    anchors,
    skipped,
    eras: eras.map((e) => ({ title: e.title, year: e.year as number })),
  };
  const contextHash = createHash("sha256")
    .update(
      JSON.stringify([
        birthYear,
        Object.entries(anchors).sort(([a], [b]) => a.localeCompare(b)),
        [...skipped].sort(),
      ]),
    )
    .digest("hex");
  return { ctx, contextHash };
}
