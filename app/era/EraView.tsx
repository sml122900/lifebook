"use client";

import { useMemo, useState, useTransition } from "react";

import type { EraEvent, EraSong } from "@/lib/era-events";
import {
  DECADES,
  type Decade,
  SECTION_BADGE_CLASS,
  SECTION_LABEL,
  decadeOf,
  youtubeSearchHref,
} from "@/lib/era-labels";

import {
  stashEraEventAction,
  unstashEraEventAction,
} from "./actions";

// 시대 연혁 둘러보기 — 클라이언트. 연대 탭(1개씩) + 카테고리 필터(사건).
// 시니어 친화: 큰 글씨·큰 버튼·한 화면에 한 연대씩. 카테고리는 사건에만
// 적용(음악은 origin 만 분류돼 있어 별도 필터 없음 — 그냥 연도 순).
//
// E2 — 사건 카드마다 "내 연혁에 담기" 토글. 옵티미스틱: 클릭 즉시 UI 갱신
// 후 server action. 실패 시 rollback + 에러. 음악은 담기 X (음악은 듣기용).

type SectionFilter = EraEvent["section"] | "ALL";

const CATEGORY_OPTIONS: { key: SectionFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "POLITICS_SOCIETY", label: SECTION_LABEL.POLITICS_SOCIETY },
  { key: "CULTURE", label: SECTION_LABEL.CULTURE },
  { key: "SPORTS", label: SECTION_LABEL.SPORTS },
  { key: "TREND", label: SECTION_LABEL.TREND },
];

export function EraView({
  events,
  songs,
  initialStashedIds,
}: {
  events: EraEvent[];
  songs: EraSong[];
  initialStashedIds: string[];
}) {
  const [decade, setDecade] = useState<Decade>(1980);
  const [section, setSection] = useState<SectionFilter>("ALL");
  // 담은 MonthEvent id 의 옵티미스틱 셋. 서버 진실은 page.tsx 가 revalidate
  // 후 다시 prefetch 하지만, 클릭 즉시 카드 표시를 바꾸려고 로컬에 복제.
  const [stashed, setStashed] = useState<Set<string>>(
    () => new Set(initialStashedIds),
  );
  const [errorByEvent, setErrorByEvent] = useState<Record<string, string>>({});

  // 선택한 연대의 사건 — 카테고리 필터 적용. 연도 → 사건들 그룹화.
  const eventsByYear = useMemo(() => {
    const filtered = events.filter((e) => {
      if (decadeOf(e.year) !== decade) return false;
      if (section !== "ALL" && e.section !== section) return false;
      return true;
    });
    const map = new Map<number, EraEvent[]>();
    for (const e of filtered) {
      const arr = map.get(e.year) ?? [];
      arr.push(e);
      map.set(e.year, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [events, decade, section]);

  // 선택한 연대의 음악 — 카테고리 필터 영향 X (음악엔 section 없음).
  const songsByYear = useMemo(() => {
    const filtered = songs.filter((s) => decadeOf(s.year) === decade);
    const map = new Map<number, EraSong[]>();
    for (const s of filtered) {
      const arr = map.get(s.year) ?? [];
      arr.push(s);
      map.set(s.year, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [songs, decade]);

  const totalEvents = eventsByYear.reduce((sum, [, arr]) => sum + arr.length, 0);
  const totalSongs = songsByYear.reduce((sum, [, arr]) => sum + arr.length, 0);

  // 옵티미스틱 토글 — 클릭 즉시 set 변경, 실패 시 원복.
  // useTransition 으로 server action 동안 disabled 처리 (더블클릭 가드).
  const [isPending, startTransition] = useTransition();

  function clearError(eventId: string) {
    setErrorByEvent((prev) => {
      if (!(eventId in prev)) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }

  function setError(eventId: string, msg: string) {
    setErrorByEvent((prev) => ({ ...prev, [eventId]: msg }));
  }

  function onStash(eventId: string) {
    if (stashed.has(eventId)) return;
    clearError(eventId);
    // 옵티미스틱.
    setStashed((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
    startTransition(async () => {
      try {
        const r = await stashEraEventAction(eventId);
        // "stashed" / "already" 모두 결과적으로 담긴 상태 — 유지.
        if (r === "not_found" || r === "year_missing") {
          setStashed((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          setError(eventId, "지금은 담을 수 없는 사건이에요.");
        }
      } catch (e) {
        console.error("[era-stash]", e);
        setStashed((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
        setError(eventId, "잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function onUnstash(eventId: string) {
    if (!stashed.has(eventId)) return;
    clearError(eventId);
    setStashed((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    startTransition(async () => {
      try {
        await unstashEraEventAction(eventId);
      } catch (e) {
        console.error("[era-unstash]", e);
        setStashed((prev) => {
          const next = new Set(prev);
          next.add(eventId);
          return next;
        });
        setError(eventId, "잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 연대 탭 — 큰 버튼 4개. 시니어 친화 위해 min-h 64px. */}
      <nav aria-label="연대 선택">
        <p className="mb-3 text-base font-semibold text-zinc-700">연대</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DECADES.map((d) => {
            const active = decade === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDecade(d.key)}
                aria-pressed={active}
                className={
                  "min-h-[64px] rounded-md border-2 px-4 py-3 text-lg font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
                  (active
                    ? "border-amber-700 bg-amber-700 text-white"
                    : "border-amber-300 bg-white text-amber-900 hover:bg-amber-50")
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 카테고리 필터 — 사건 한정 */}
      <fieldset>
        <legend className="mb-3 text-base font-semibold text-zinc-700">
          사건 카테고리
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((opt) => {
            const active = section === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSection(opt.key)}
                className={
                  "min-h-[48px] rounded-md border-2 px-4 py-2 text-base font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
                  (active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 사건 섹션 */}
      <section aria-labelledby="events-heading">
        <h2
          id="events-heading"
          className="text-3xl font-bold text-zinc-900 sm:text-4xl"
        >
          {decade}년대 — 큰 사건
        </h2>
        <p className="mt-2 text-base text-zinc-700">
          {totalEvents > 0
            ? `${totalEvents}건의 사건이 있어요.`
            : "이 카테고리에선 사건이 없어요. 다른 카테고리를 골라 보세요."}
        </p>

        {eventsByYear.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {eventsByYear.map(([year, items]) => (
              <YearGroup key={year} year={year} count={items.length}>
                <ul className="flex flex-col gap-3">
                  {items.map((e) => (
                    <EraEventCard
                      key={e.id}
                      event={e}
                      isStashed={stashed.has(e.id)}
                      isBusy={isPending}
                      error={errorByEvent[e.id]}
                      onStash={() => onStash(e.id)}
                      onUnstash={() => onUnstash(e.id)}
                    />
                  ))}
                </ul>
              </YearGroup>
            ))}
          </div>
        )}
      </section>

      {/* 음악 섹션 */}
      <section aria-labelledby="songs-heading" className="border-t-2 border-zinc-200 pt-8">
        <h2
          id="songs-heading"
          className="text-3xl font-bold text-zinc-900 sm:text-4xl"
        >
          {decade}년대 — 그 시절 노래
        </h2>
        <p className="mt-2 text-base text-zinc-700">
          {totalSongs > 0
            ? `${totalSongs}곡이 있어요. 곡명을 누르면 유튜브에서 찾아 들으실 수 있어요.`
            : "이 연대 음악은 아직 없어요."}
        </p>

        {songsByYear.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {songsByYear.map(([year, items]) => (
              <YearGroup key={year} year={year} count={items.length}>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {items.map((s) => (
                    <EraSongCard key={s.id} song={s} />
                  ))}
                </ul>
              </YearGroup>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// 연도 헤더 + 자식. h3 로 시멘틱 유지.
function YearGroup({
  year,
  count,
  children,
}: {
  year: number;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-2xl font-bold text-amber-900">
        {year}년
        <span className="ml-2 text-base font-semibold text-amber-700">
          · {count}건
        </span>
      </h3>
      {children}
    </div>
  );
}

function EraEventCard({
  event,
  isStashed,
  isBusy,
  error,
  onStash,
  onUnstash,
}: {
  event: EraEvent;
  isStashed: boolean;
  isBusy: boolean;
  error: string | undefined;
  onStash: () => void;
  onUnstash: () => void;
}) {
  const when =
    event.month != null ? `${event.year}년 ${event.month}월` : `${event.year}년`;
  // 담은 카드는 emerald 톤으로 살짝 강조 — "이미 내 것" 시각 분리.
  const cardBorder = isStashed ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white";
  return (
    <li className={`flex flex-col gap-3 rounded-md border-2 p-5 ${cardBorder}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-semibold text-zinc-700">{when}</span>
        <span
          className={
            "inline-flex items-center rounded-full border-2 px-3 py-0.5 text-xs font-semibold " +
            SECTION_BADGE_CLASS[event.section]
          }
        >
          {SECTION_LABEL[event.section]}
        </span>
        {event.confidence === "APPROX" && (
          <span className="text-xs text-zinc-500">추정</span>
        )}
      </div>
      <p className="text-xl font-bold leading-snug text-zinc-900 sm:text-2xl">
        {event.title}
      </p>
      {event.description && (
        <p className="text-base leading-relaxed text-zinc-700 sm:text-lg">
          {event.description}
        </p>
      )}
      {event.source && (
        <p className="text-xs text-zinc-500">출처: {event.source}</p>
      )}

      {/* E2 — 담기 / 담음 토글. 시니어 친화 위해 큰 버튼 + 한 문장 안내. */}
      <div className="flex flex-col gap-2 border-t-2 border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        {isStashed ? (
          <>
            <p className="text-base font-semibold text-emerald-800">
              <span aria-hidden>✓ </span>내 연혁에 있어요
            </p>
            <button
              type="button"
              onClick={onUnstash}
              disabled={isBusy}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              내 연혁에서 빼기
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              기억나는 사건이면 내 연혁에 담아두세요.
            </p>
            <button
              type="button"
              onClick={onStash}
              disabled={isBusy}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 px-5 py-2 text-base font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              내 연혁에 담기
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </li>
  );
}

function EraSongCard({ song }: { song: EraSong }) {
  const when =
    song.month != null ? `${song.year}년 ${song.month}월` : `${song.year}년`;
  const originLabel = song.origin === "DOMESTIC" ? "국내" : "해외";
  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-zinc-600">{when}</span>
        <span className="inline-flex items-center rounded-full border-2 border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
          {originLabel}
        </span>
      </div>
      <p className="text-lg font-bold leading-snug text-zinc-900 sm:text-xl">
        {song.title}
      </p>
      <p className="text-base text-zinc-700">{song.artist}</p>
      <a
        href={youtubeSearchHref(song.youtubeQuery)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${song.title} — ${song.artist} 유튜브에서 찾기`}
        className="mt-1 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-md border-2 border-rose-400 bg-rose-50 px-4 py-2 text-base font-semibold text-rose-900 hover:bg-rose-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        <span aria-hidden>▶</span>
        유튜브에서 듣기
      </a>
    </li>
  );
}
