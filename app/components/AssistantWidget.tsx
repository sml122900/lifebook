import { auth } from "@/auth";
import { getLifeEvents } from "@/lib/life-events";
import {
  APPROX_DEFAULT_MONTH,
  LATEST_MONTH,
  LATEST_YEAR,
} from "@/lib/timeline-constants";
import { listAssistantAnswers } from "@/lib/timemachine-assistant-saved";

import { AssistantModal } from "../life-timeline/AssistantModal";
import type { InitialSavedAnswer } from "../timemachine/[year]/[month]/AssistantPanel";

// v3.4 — 글로벌 AI 비서 위젯 (RSC).
//
// 모든 인증된 화면의 우측 하단에 떠 있는 floating 버튼. 클릭 시 비서 모달
// (AssistantModal) 이 열림. 모달 본문은 v2 AssistantPanel 그대로 임베드.
//
// 컨텍스트:
//   - 가장 최근 life_event (eventYear, eventMonth ?? 6) 기준으로 답을 정렬.
//     사용자가 막 본 시기와 비서의 회상 기준이 일치하도록.
//   - life_event 0 개면 LATEST(시드 마지막 달) 폴백 — 시드 안에 답할
//     시대/노래가 풍성해 빈 답을 피한다.
//
// 비인증·동의 미완료 사용자에겐 위젯 자체를 렌더 X (null 반환).
//
// 기준 시기 상수(LATEST_YEAR/MONTH·APPROX_DEFAULT_MONTH)는
// lib/timeline-constants.ts 로 통합 — page.tsx 와 단일 출처 공유.

export async function AssistantWidget() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const events = await getLifeEvents(userId);
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  const year = lastEvent ? lastEvent.eventYear : LATEST_YEAR;
  const month = lastEvent
    ? (lastEvent.eventMonth ?? APPROX_DEFAULT_MONTH)
    : LATEST_MONTH;
  const label = lastEvent
    ? lastEvent.eventMonth != null
      ? `${lastEvent.eventYear}년 ${lastEvent.eventMonth}월 ${lastEvent.title}`
      : `${lastEvent.eventYear}년쯤 ${lastEvent.title}`
    : `${LATEST_YEAR}년 ${LATEST_MONTH}월`;

  const savedRaw = await listAssistantAnswers(userId, year, month);
  const initialSavedAnswers: InitialSavedAnswer[] = savedRaw.map((s) => ({
    id: s.id,
    question: s.question,
    createdAtIso: s.createdAt.toISOString(),
    answer: s.answer,
  }));

  return (
    <AssistantModal
      variant="floating"
      fallbackYear={year}
      fallbackMonth={month}
      fallbackLabel={label}
      initialSavedAnswers={initialSavedAnswers}
    />
  );
}
