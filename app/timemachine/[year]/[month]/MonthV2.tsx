"use client";

import { useMemo, useState, useTransition } from "react";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";

import { saveTimemachineMonthAction } from "./actions";
import {
  AssistantPanel,
  type InitialSavedAnswer,
  type KeptEventInput,
} from "./AssistantPanel";
import { cleanupVoiceTextAction } from "./cleanup-action";

// Phase V2 — 타임머신 새 메인 화면.
//
// 레이아웃:
//   - 데스크톱(lg+): 좌(기억칸=MonthStory 승격) / 우(AssistantPanel) 2단
//   - 모바일: 위(기억칸) / 아래(비서) 세로
//
// 기억칸 = MonthStory 승격. 시니어 가독성 위해 라벨·textarea 폰트 크게.
// 음성·AI 다듬기는 T4 VoiceTextarea + cleanupVoiceTextAction 그대로.
//
// 사건 그리드(EventItem)는 v1 잔재라 여기선 안 씀. 비서가 답한 BIG 이벤트
// 중에서 "내 타임라인에 추가" 를 누른 것만 keptEvents 에 들어가, T6
// saveTimemachineMonth 로 저장된다.

type KeptEvent = { monthEventId: string; title: string; story: string };

export type MonthV2Initial = {
  monthStory: string;
  keptEvents: { monthEventId: string; title: string; story: string }[];
};

export function MonthV2({
  year,
  month,
  initial,
  initialSavedAnswers,
}: {
  year: number;
  month: number;
  initial: MonthV2Initial;
  initialSavedAnswers: InitialSavedAnswer[];
}) {
  const [monthStory, setMonthStory] = useState(initial.monthStory);
  const [keptEvents, setKeptEvents] = useState<KeptEvent[]>(
    initial.keptEvents,
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const keptIdSet = useMemo(
    () => new Set(keptEvents.map((k) => k.monthEventId)),
    [keptEvents],
  );

  function handleAddEvent(k: KeptEventInput) {
    setKeptEvents((prev) => {
      if (prev.some((p) => p.monthEventId === k.monthEventId)) return prev;
      return [...prev, { ...k, story: "" }];
    });
    setSavedAt(null);
  }

  function handleRemoveEvent(monthEventId: string) {
    setKeptEvents((prev) =>
      prev.filter((p) => p.monthEventId !== monthEventId),
    );
    setSavedAt(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveTimemachineMonthAction(year, month, {
          keptEvents: keptEvents.map((k) => ({
            monthEventId: k.monthEventId,
            story: k.story,
          })),
          monthStory,
        });
        setSavedAt(new Date());
      } catch (err) {
        console.error("[timemachine-save]", err);
        setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* 좌(메인): 내 기억 입력칸 — 화면 주인공 */}
        <section className="flex flex-col gap-4 rounded-md border-2 border-amber-200 bg-white p-6">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              {year}년 {month}월, 당신의 이야기
            </h2>
            <p className="mt-2 text-base text-zinc-700 sm:text-lg">
              기억나는 만큼 자유롭게 적어주세요. 옆의 비서에게 물어봐도 좋아요.
            </p>
          </div>
          <VoiceTextarea
            value={monthStory}
            onChange={(v) => {
              setMonthStory(v);
              setSavedAt(null);
            }}
            rows={12}
            placeholder="그때 어떤 일이 있었는지, 누구와 어디서 지냈는지…"
            ariaLabel={`${year}년 ${month}월 내 이야기`}
            textareaClassName="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-4 text-lg leading-relaxed text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:text-xl"
            onCleanup={cleanupVoiceTextAction}
          />

          {/* 비서에서 타임라인에 추가된 사건 목록 */}
          {keptEvents.length > 0 && (
            <div className="flex flex-col gap-2 border-t-2 border-zinc-200 pt-4">
              <p className="text-base font-semibold text-zinc-800">
                내가 남긴 사건
              </p>
              <ul className="flex flex-col gap-2">
                {keptEvents.map((k) => (
                  <li
                    key={k.monthEventId}
                    className="flex items-center justify-between gap-3 rounded-md border-2 border-amber-200 bg-amber-50 px-4 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-base font-semibold text-amber-900 sm:text-lg">
                      {k.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEvent(k.monthEventId)}
                      aria-label={`${k.title} 빼기`}
                      className="shrink-0 rounded-md border-2 border-zinc-300 bg-white px-3 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
                    >
                      빼기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 우(조수): AI 비서 */}
        <AssistantPanel
          year={year}
          month={month}
          keptEventIds={keptIdSet}
          onAddEvent={handleAddEvent}
          initialSavedAnswers={initialSavedAnswers}
        />
      </div>

      {/* 저장 영역 */}
      <div className="flex flex-col gap-3 border-t-2 border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-base" aria-live="polite">
          {error ? (
            <span className="text-rose-700">{error}</span>
          ) : savedAt ? (
            <span className="text-emerald-700">
              저장됨 · {savedAt.toLocaleTimeString("ko-KR")}
            </span>
          ) : (
            <span className="text-zinc-600">
              변경 사항은 &quot;저장&quot; 버튼을 눌러야 보관돼요.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-amber-700 px-8 py-4 text-xl font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          {isPending ? "저장 중…" : "이 달 저장하기"}
        </button>
      </div>
    </div>
  );
}
