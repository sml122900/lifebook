// v3 통합 채팅(P2→P3) — 갭 감지 엔진. 순수 읽기 전용 계산 — DB 쓰기 없음.
// app/actions/gaps.ts("use server")가 감싸서 클라에 노출한다.
//
// P3 — cardLabel(카드/칩에 보이는 문구, 결핍 프레이밍 금지)과 userPrompt
// (클릭 시 실제로 묻는 질문)를 분리했다. 이전엔 단일 label 을 그대로
// addBot 해버려 "출생(1963) 이후로 12년 동안 이야기가 비어있어요 편하게
// 말씀해주세요." 처럼 내부 진단 문구가 사용자에게 그대로 노출되던 버그가
// 있었다(unconfirmed/needs_review 는 getConfirmQuestionForEvent 가 별도로
// 자연스러운 질문을 생성하므로 userPrompt 를 안 씀 — 여기 값은 미사용
// placeholder).

import { prisma } from "./db";
import type { LifeEventType } from "./generated/prisma/enums";

export type GapType = "needs_review" | "unconfirmed" | "time_gap" | "episode";

export type Gap = {
  type: GapType;
  // time_gap 은 "사이"를 가리키므로 구간의 앞쪽 이벤트를 anchor 로 삼는다
  // (P3-2 — /story-review 딥링크에 필요).
  targetEventId?: string;
  // 카드/칩에 보이는 문구. 결핍 프레이밍("~비어있어요") 금지.
  cardLabel: string;
  // 클릭 시 실제로 묻는 질문(episode/unconfirmed/needs_review 는 각자
  // 전용 엔진이 자체 생성하므로 미사용 — time_gap 만 이 값을 그대로 addBot).
  userPrompt: string;
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
        cardLabel: `${label} 이야기, 다시 한번 여쭤봐도 될까요?`,
        userPrompt: "",
        priority: 1,
      });
    } else if (e.status === "UNCONFIRMED") {
      gaps.push({
        type: "unconfirmed",
        targetEventId: e.id,
        cardLabel: `${label} 이야기를 아직 못 들었어요`,
        userPrompt: "",
        priority: 2,
      });
    } else if ((e.status === "CONFIRMED" || e.status === "CORRECTED") && !e.hasEpisode) {
      gaps.push({
        type: "episode",
        targetEventId: e.id,
        cardLabel: `${label} 이야기를 더 들어볼까요?`,
        userPrompt: "",
        priority: 4,
      });
    }
  }

  // 시간 공백 — confirmed/corrected 이면서 연도가 있는 이벤트만 시간순으로.
  // anchor(구간 앞쪽 이벤트)가 BIRTH 인지로 어린 시절/그 이후를 구분해
  // userPrompt 톤을 다르게 한다.
  type TimedEvent = { id: string; type: LifeEventType; label: string; year: number };

  const timed: TimedEvent[] = events
    .filter((e) => e.status === "CONFIRMED" || e.status === "CORRECTED")
    .map((e) => ({
      id: e.id,
      type: e.type,
      label: e.correctedLabel ?? e.label,
      year: e.correctedYear ?? e.year,
    }))
    .filter((e): e is TimedEvent => e.year !== null)
    .sort((a, b) => a.year - b.year);

  // P4-2 — "그 무렵엔"은 사용자가 어느 구간인지 알 수 없어 모호했다. 앵커
  // 이벤트 기준으로 자연스럽게 구간을 녹인다. 연도 숫자 직접 노출은 피하고
  // 사건 기준 표현만 쓴다.
  function timeGapPrompt(anchor: TimedEvent): string {
    if (anchor.type === "BIRTH") return "국민학교 들어가기 전, 어릴 적엔 어떻게 지내셨어요?";
    if (anchor.type === "MARRIAGE") return "결혼하시고 나서는 어떻게 지내셨어요?";
    return `${anchor.label} 이후로는 어떻게 지내셨어요?`;
  }

  for (let i = 0; i < timed.length - 1; i++) {
    const anchor = timed[i];
    const span = timed[i + 1].year - anchor.year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        targetEventId: anchor.id,
        cardLabel: `${anchor.label}(${anchor.year}) 이후 이야기를 아직 못 들었어요`,
        userPrompt: timeGapPrompt(anchor),
        priority: 3,
      });
    }
  }
  if (timed.length > 0) {
    const anchor = timed[timed.length - 1];
    const span = new Date().getFullYear() - anchor.year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        targetEventId: anchor.id,
        cardLabel: `${anchor.label}(${anchor.year}) 이후 이야기를 아직 못 들었어요`,
        userPrompt: timeGapPrompt(anchor),
        priority: 3,
      });
    }
  }

  gaps.sort((a, b) => a.priority - b.priority);
  return gaps;
}
