"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AssistantPanel,
  type InitialSavedAnswer,
  type KeptEventInput,
} from "../timemachine/[year]/[month]/AssistantPanel";

// Phase L6 — 인생 연혁의 AI 비서 버튼 + 모달.
//
// L3 의 AssistantButtonStub 를 교체. 실제 v2 비서(AssistantPanel)를 모달
// 안에 그대로 임베드한다 — v2 컴포넌트 무수정 정책 준수.
//
// 맥락 결정 (page.tsx 가 결정해 props 로 내림):
//   - 가장 최근 life_event 의 (eventYear, eventMonth ?? 6) — 사용자가 막
//     본 연혁의 마지막 시기와 비서 컨텍스트가 일치해 자연스러움.
//   - life_event 0 개 → LATEST(시드 마지막 달). 시드 안에 비서가 답할
//     시대 사건/노래가 풍성해 빈 답이 안 나오게.
//
// "내 타임라인에 추가" 처리:
//   - v2 의 onAddEvent 는 그 (year, month) 의 사건을 keptEvents 에 넣는
//     의미. 연혁 모달 컨텍스트는 다르다(특정 달 회고가 아님).
//   - 클릭 시 모달 닫고 /life-timeline/add 로 push — 사용자가 L4 흐름으로
//     자유롭게 정리. v2 동작 자체는 무수정, 호출자만 다른 의도 처리.

export function AssistantModal({
  fallbackYear,
  fallbackMonth,
  fallbackLabel,
  initialSavedAnswers,
}: {
  fallbackYear: number;
  fallbackMonth: number;
  // "2020년 5월 결혼" / "2026년 5월" 같은 안내 라벨 (사용자에게 컨텍스트
  // 가 무엇인지 명시 — 답이 그 시기 기준이라는 걸 알 수 있게)
  fallbackLabel: string;
  initialSavedAnswers: InitialSavedAnswer[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 연혁 컨텍스트에서 사건 1개 "추가" 는 v2 의 (year, month) keptEvents
  // 의미와 안 맞으므로 L4 자유 추가 흐름으로 보낸다.
  function handleAddEvent(_k: KeptEventInput) {
    setOpen(false);
    router.push("/life-timeline/add");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="AI 비서와 대화"
        className="inline-flex min-h-[56px] items-center gap-2 rounded-md border-2 border-violet-500 bg-violet-50 px-5 py-3 text-lg font-semibold text-violet-900 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden className="text-xl">
          🤖
        </span>
        <span>AI 비서와 대화</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assistant-modal-title"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-3xl flex-col rounded-md border-2 border-violet-300 bg-white shadow-xl"
            style={{ maxHeight: "min(90vh, 100%)" }}
          >
            {/* 헤더 — 큰 닫기 버튼 + 맥락 안내 */}
            <header className="flex items-start justify-between gap-3 border-b-2 border-violet-200 px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="assistant-modal-title"
                  className="text-2xl font-bold text-zinc-900"
                >
                  AI 비서와 대화
                </h2>
                <p className="mt-1 text-base text-zinc-700">
                  궁금한 게 있으면 가볍게 물어보세요. 답은{" "}
                  <b>{fallbackLabel}</b> 기준이에요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="비서 닫기"
                className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border-2 border-zinc-300 text-2xl font-bold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
              >
                ✕
              </button>
            </header>

            {/* 본문 — AssistantPanel 그대로 임베드. 본문이 모달 안에서 스크롤. */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <AssistantPanel
                year={fallbackYear}
                month={fallbackMonth}
                keptEventIds={EMPTY_SET}
                onAddEvent={handleAddEvent}
                initialSavedAnswers={initialSavedAnswers}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 모달이 닫혀 있을 때도 매 렌더 새 Set 을 만들지 않게 모듈 상수로.
const EMPTY_SET: Set<string> = new Set();
