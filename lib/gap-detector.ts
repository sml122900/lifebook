// v3 통합 채팅(P2) — 갭 감지 엔진 v1. 순수 읽기 전용 계산 — DB 쓰기 없음.
// app/actions/gaps.ts("use server")가 감싸서 클라에 노출한다.

import { prisma } from "./db";

export type GapType = "needs_review" | "unconfirmed" | "time_gap" | "episode";

export type Gap = {
  type: GapType;
  // time_gap 은 특정 이벤트 하나가 아니라 "사이" 를 가리키므로 없음.
  targetEventId?: string;
  label: string;
  // 낮을수록 우선(정리 화면 상위 노출).
  priority: number;
};

// confirmed 이벤트 사이(또는 마지막 이벤트→현재)가 이 년수 이상 비면 시간 공백.
const TIME_GAP_YEARS = 10;

export async function detectGaps(userId: string): Promise<Gap[]> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId },
    orderBy: { sequenceOrder: "asc" },
  });

  const gaps: Gap[] = [];

  for (const e of events) {
    const label = e.correctedLabel ?? e.label;
    if (e.status === "UNCONFIRMED" && e.needsReview) {
      gaps.push({
        type: "needs_review",
        targetEventId: e.id,
        label: `${label} 이야기, 다시 한번 여쭤봐도 될까요?`,
        priority: 1,
      });
    } else if (e.status === "UNCONFIRMED") {
      gaps.push({
        type: "unconfirmed",
        targetEventId: e.id,
        label: `${label} 이야기가 아직 비어있어요`,
        priority: 2,
      });
    } else if ((e.status === "CONFIRMED" || e.status === "CORRECTED") && !e.hasEpisode) {
      gaps.push({
        type: "episode",
        targetEventId: e.id,
        label: `${label} 이야기를 더 들어볼까요?`,
        priority: 4,
      });
    }
  }

  // 시간 공백 — confirmed/corrected 이면서 연도가 있는 이벤트만 시간순으로.
  const timed = events
    .filter((e) => e.status === "CONFIRMED" || e.status === "CORRECTED")
    .map((e) => ({ label: e.correctedLabel ?? e.label, year: e.correctedYear ?? e.year }))
    .filter((e): e is { label: string; year: number } => e.year !== null)
    .sort((a, b) => a.year - b.year);

  for (let i = 0; i < timed.length - 1; i++) {
    const span = timed[i + 1].year - timed[i].year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        label: `${timed[i].label}(${timed[i].year}) 이후로 ${span}년 동안 이야기가 비어있어요`,
        priority: 3,
      });
    }
  }
  if (timed.length > 0) {
    const last = timed[timed.length - 1];
    const span = new Date().getFullYear() - last.year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        label: `${last.label}(${last.year}) 이후로 이야기가 비어있어요`,
        priority: 3,
      });
    }
  }

  gaps.sort((a, b) => a.priority - b.priority);
  return gaps;
}
