"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";

import { saveTimemachineMonthAction } from "./actions";
import { EventItem, type EventItemData, type Status } from "./EventItem";
import { MonthStory } from "./MonthStory";

// 한 달 화면의 모든 편집 상태(사건별 status/story + 그 달 회고) 를
// 묶어 들고 있는 클라이언트 래퍼. 음악 섹션은 children 으로 받아
// 사건 목록과 그 달 회고 사이에 끼운다.
//
// 저장: 단일 server action 호출로 (남긴 사건 + 메모 + 회고) 한 묶음 upsert.
// 페이지 새로고침 시 page.tsx 가 initial 로 다시 주입해 복원.

const SECTION_LABEL: Record<string, string> = {
  POLITICS_SOCIETY: "정치·사회",
  CULTURE: "문화",
  SPORTS: "스포츠",
  TREND: "유행",
};
const SECTION_ORDER = [
  "POLITICS_SOCIETY",
  "CULTURE",
  "SPORTS",
  "TREND",
] as const;

export type EventBySection = Record<string, EventItemData[]>;

export type InitialState = {
  // 저장된 "남긴 사건" id 집합 — 페이지 로드 시 status="kept" 로 복원.
  keptEventIds: string[];
  // monthEventId -> 저장된 메모 텍스트.
  storyByEventId: Record<string, string>;
  monthStory: string;
};

type EventState = { status: Status; story: string };

export function MonthForm({
  year,
  month,
  eventsBySection,
  initial,
  children,
}: {
  year: number;
  month: number;
  eventsBySection: EventBySection;
  initial: InitialState;
  children?: ReactNode;
}) {
  const initialMap = useMemo<Record<string, EventState>>(() => {
    const map: Record<string, EventState> = {};
    const keptSet = new Set(initial.keptEventIds);
    for (const section of SECTION_ORDER) {
      const items = eventsBySection[section] ?? [];
      for (const item of items) {
        const kept = keptSet.has(item.id);
        map[item.id] = {
          status: kept ? "kept" : "pending",
          story: initial.storyByEventId[item.id] ?? "",
        };
      }
    }
    return map;
  }, [eventsBySection, initial]);

  const [eventStates, setEventStates] =
    useState<Record<string, EventState>>(initialMap);
  const [monthStory, setMonthStory] = useState(initial.monthStory);

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateState(eventId: string, patch: Partial<EventState>) {
    setEventStates((prev) => ({
      ...prev,
      [eventId]: { ...prev[eventId], ...patch },
    }));
    setSavedAt(null);
  }

  function handleSave() {
    setError(null);
    const keptEvents = Object.entries(eventStates)
      .filter(([, st]) => st.status === "kept")
      .map(([monthEventId, st]) => ({ monthEventId, story: st.story }));

    startTransition(async () => {
      try {
        await saveTimemachineMonthAction(year, month, {
          keptEvents,
          monthStory,
        });
        setSavedAt(new Date());
      } catch (err) {
        console.error("[timemachine-save]", err);
        setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  const anyEvents = SECTION_ORDER.some(
    (s) => (eventsBySection[s] ?? []).length > 0,
  );

  return (
    <>
      {anyEvents ? (
        <div className="flex flex-col gap-10">
          {SECTION_ORDER.map((section) => {
            const items = eventsBySection[section] ?? [];
            if (items.length === 0) return null;
            return (
              <section key={section}>
                <h2 className="mb-4 text-2xl font-bold text-ink sm:text-3xl">
                  {SECTION_LABEL[section]}
                </h2>
                <ul className="flex flex-col gap-4">
                  {items.map((item) => {
                    const st = eventStates[item.id] ?? {
                      status: "pending",
                      story: "",
                    };
                    return (
                      <EventItem
                        key={item.id}
                        item={item}
                        status={st.status}
                        onStatusChange={(s) =>
                          updateState(item.id, { status: s })
                        }
                        story={st.story}
                        onStoryChange={(s) =>
                          updateState(item.id, { story: s })
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border-2 border-line bg-canvas p-5">
          <p className="text-lg text-ink">
            이 달은 아직 자료가 없어요. 다음 달로 넘어가 보세요.
          </p>
        </div>
      )}

      {/* 음악 섹션 — 서버 렌더된 JSX 를 children 으로 받아 끼운다. */}
      {children}

      <MonthStory
        year={year}
        month={month}
        value={monthStory}
        onChange={(v) => {
          setMonthStory(v);
          setSavedAt(null);
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-base" aria-live="polite">
          {error ? (
            <span className="text-rose-700">{error}</span>
          ) : savedAt ? (
            <span className="text-emerald-700">
              저장됨 · {savedAt.toLocaleTimeString("ko-KR")}
            </span>
          ) : (
            <span className="text-ink-soft">
              변경 사항은 "저장" 버튼을 눌러야 보관돼요.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-amber-700 px-8 py-4 text-xl font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          {isPending ? "저장 중…" : "이 달 저장하기"}
        </button>
      </div>
    </>
  );
}
