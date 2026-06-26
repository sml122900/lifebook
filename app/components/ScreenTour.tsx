"use client";

import { HelpCircle } from "lucide-react";

import { CoachMarks } from "./CoachMarks";
import { type CoachStep, START_TOUR_EVENT } from "@/lib/tours";

// 한 화면의 둘러보기 묶음 — 떠 있는 "도움말" 버튼 + CoachMarks 엔진.
//
// 메인 코치마크와 같은 엔진을 재사용한다. 서버 컴포넌트(각 포스터 페이지)가
// completedTours 로 첫 방문 여부를 판단해 autoStart 를 내리고, 화면에 data-tour
// 속성만 달면 동작한다. "도움말" 버튼은 그 화면의 CoachMarks 를 다시 띄운다
// (START_TOUR_EVENT — 한 화면엔 CoachMarks 가 하나뿐이라 충돌 없음).
//
// 위치는 좌측 하단(우측 하단 AI 비서 FAB 와 겹치지 않게). 투어가 뜨면 오버레이
// (z-60)가 이 버튼(z-40)을 덮어 투어 중엔 가려진다.

export function ScreenTour({
  tourId,
  steps,
  autoStart,
  onComplete,
}: {
  tourId: string;
  steps: CoachStep[];
  autoStart: boolean;
  onComplete: (tourId: string) => void | Promise<void>;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT))}
        aria-label="이 화면 둘러보기"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-6 z-40 inline-flex min-h-[52px] items-center gap-2 rounded-full border-2 border-amber-400 bg-surface px-5 text-base font-bold text-amber-900 shadow-lg hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      >
        <HelpCircle strokeWidth={1.75} aria-hidden className="h-5 w-5" />
        도움말
      </button>
      <CoachMarks
        tourId={tourId}
        steps={steps}
        autoStart={autoStart}
        onComplete={onComplete}
      />
    </>
  );
}
