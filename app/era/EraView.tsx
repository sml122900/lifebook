"use client";

import { useMemo, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/Button";
import type { EraEvent, EraSong } from "@/lib/era-events";
import { Search } from "lucide-react";

import {
  DECADE_BG_CLASS,
  DECADE_STRIP_CLASS,
  DECADES,
  type Decade,
  SECTION_BADGE_CLASS,
  SECTION_ICON,
  SECTION_ICON_CLASS,
  SECTION_LABEL,
  decadeOf,
  googleSearchHref,
  youtubeSearchHref,
} from "@/lib/era-labels";

import {
  stashEraEventAction,
  unstashEraEventAction,
} from "./actions";
import { EraMemoryEditor } from "./EraMemoryEditor";

// 시대 연혁 둘러보기 — 클라이언트. 연대 탭(1개씩) + 카테고리 필터(사건).
// 시니어 친화: 큰 글씨·큰 버튼·한 화면에 한 연대씩. 카테고리는 사건에만
// 적용(음악은 origin 만 분류돼 있어 별도 필터 없음 — 그냥 연도 순).
//
// 사건은 제목 리스트 + 아코디언 — 한 연대에 사건 15개면 카드 다 펼쳐 텍스트
// 폭탄. 평소엔 제목 + 카테고리 뱃지만, 클릭 시 그 자리에서 펼침. 여러 개
// 동시 펼침 허용 (한 연대 비교가 자연스러움).
//
// E2 — 사건 펼친 상세 안에 "내 연혁에 담기" 토글. 옵티미스틱: 클릭 즉시 UI
// 갱신 후 server action. 실패 시 rollback + 에러. 음악은 담기 X (음악은
// 듣기용, 카드 방식 유지).
//
// E3 — 담은 사건의 펼친 상세에 본인 회상(content) 입력 영역. content 있으면
// "그때 나는" 표시 + 수정 가능, 없으면 부드러운 입력 유도. /life-timeline 의
// EraCard 와 동일 server action(saveEraMemoryAction) 공유 → 한 쪽에서 적으면
// revalidate 로 다른 쪽도 갱신. 담지 않은 사건엔 회상 입력 안 보임 (담아야
// 적을 수 있음 — saveEraMemory 가 not_stashed 가드).

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
  initialStashedMemories,
}: {
  events: EraEvent[];
  songs: EraSong[];
  // E3 — monthEventId → content. 담은 사건만 키 존재(미입력은 null 값).
  // 안 담은 사건은 키 없음. .has(id) 로 담음 여부 + .get(id) 로 회상 prefetch.
  initialStashedMemories: Record<string, string | null>;
}) {
  const [decade, setDecade] = useState<Decade>(1980);
  const [section, setSection] = useState<SectionFilter>("ALL");
  // 담은 MonthEvent id → content 의 옵티미스틱 맵. 서버 진실은 page.tsx 가
  // revalidate 후 다시 prefetch 하지만, 클릭/저장 즉시 화면 반영을 위해 복제.
  const [stashedMemories, setStashedMemories] = useState<
    Map<string, string | null>
  >(() => new Map(Object.entries(initialStashedMemories)));
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

  // 펼쳐진 사건 id 셋 — 여러 개 동시 펼침 허용 (한 연도 안에서 비교).
  // 연대/카테고리 바뀌어 카드가 사라져도 셋엔 남지만 무해 (다음 펼침에서
  // 재사용 가능, 메모리 누적 미미).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpand(eventId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

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
    if (stashedMemories.has(eventId)) return;
    clearError(eventId);
    // 옵티미스틱 — 처음 담으면 content 는 null.
    setStashedMemories((prev) => {
      const next = new Map(prev);
      next.set(eventId, null);
      return next;
    });
    startTransition(async () => {
      try {
        const r = await stashEraEventAction(eventId);
        // "stashed" / "already" 모두 결과적으로 담긴 상태 — 유지.
        if (r === "not_found" || r === "year_missing") {
          setStashedMemories((prev) => {
            const next = new Map(prev);
            next.delete(eventId);
            return next;
          });
          setError(eventId, "지금은 담을 수 없는 사건이에요.");
        }
      } catch (e) {
        console.error("[era-stash]", e);
        setStashedMemories((prev) => {
          const next = new Map(prev);
          next.delete(eventId);
          return next;
        });
        setError(eventId, "잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function onUnstash(eventId: string) {
    if (!stashedMemories.has(eventId)) return;
    clearError(eventId);
    // 빼기 옵티미스틱 — content 가 있었으면 rollback 위해 백업.
    const prevContent = stashedMemories.get(eventId) ?? null;
    setStashedMemories((prev) => {
      const next = new Map(prev);
      next.delete(eventId);
      return next;
    });
    startTransition(async () => {
      try {
        await unstashEraEventAction(eventId);
      } catch (e) {
        console.error("[era-unstash]", e);
        setStashedMemories((prev) => {
          const next = new Map(prev);
          next.set(eventId, prevContent);
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
        <p className="mb-3 text-base font-semibold text-ink-soft">연대</p>
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
                    : "border-amber-300 bg-surface text-amber-900 hover:bg-amber-50")
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
        <legend className="mb-3 text-base font-semibold text-ink-soft">
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
                    ? "border-brand bg-banner text-action"
                    : "border-line bg-surface text-ink-soft hover:bg-banner")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 사건 섹션 — 연대별 은은한 배경 (가독성 영향 0, 카드는 흰색 그대로). */}
      <section
        aria-labelledby="events-heading"
        className={`rounded-lg p-6 ${DECADE_BG_CLASS[decade]}`}
      >
        <h2
          id="events-heading"
          className="text-3xl font-bold text-ink sm:text-4xl"
        >
          {decade}년대 — 큰 사건
        </h2>
        <p className="mt-2 text-base text-ink-soft">
          {totalEvents > 0
            ? `${totalEvents}건의 사건이 있어요.`
            : "이 카테고리에선 사건이 없어요. 다른 카테고리를 골라 보세요."}
        </p>

        {eventsByYear.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {eventsByYear.map(([year, items]) => (
              <YearGroup key={year} year={year} count={items.length}>
                <ul className="flex flex-col gap-2">
                  {items.map((e) => {
                    const isStashed = stashedMemories.has(e.id);
                    const memoryContent = isStashed
                      ? stashedMemories.get(e.id) ?? null
                      : null;
                    return (
                      <EraEventRow
                        key={e.id}
                        event={e}
                        isStashed={isStashed}
                        memoryContent={memoryContent}
                        isExpanded={expandedIds.has(e.id)}
                        isBusy={isPending}
                        error={errorByEvent[e.id]}
                        onToggle={() => toggleExpand(e.id)}
                        onStash={() => onStash(e.id)}
                        onUnstash={() => onUnstash(e.id)}
                        onMemorySaved={(newContent) => {
                          setStashedMemories((prev) => {
                            const next = new Map(prev);
                            next.set(e.id, newContent);
                            return next;
                          });
                        }}
                      />
                    );
                  })}
                </ul>
              </YearGroup>
            ))}
          </div>
        )}
      </section>

      {/* 음악 섹션 — 사건과 같은 연대 배경 (한 화면 시각 통일). */}
      <section
        aria-labelledby="songs-heading"
        className={`rounded-lg p-6 ${DECADE_BG_CLASS[decade]}`}
      >
        <h2
          id="songs-heading"
          className="text-3xl font-bold text-ink sm:text-4xl"
        >
          {decade}년대 — 그 시절 노래
        </h2>
        <p className="mt-2 text-base text-ink-soft">
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

// 사건 한 줄 (아코디언). 평소엔 제목 + 카테고리 뱃지 + (담은 사건이면) ✓ +
// 화살표. 헤더 줄 클릭 → 그 자리에서 아래로 상세 펼침 (한 번에 여러 개 허용).
//
// 펼침 전환은 grid-rows [0fr ↔ 1fr] 패턴 — height auto 대응 + 부드러운 트랜지션.
// 자식은 overflow-hidden 으로 잘려 보이지 않도록.
function EraEventRow({
  event,
  isStashed,
  memoryContent,
  isExpanded,
  isBusy,
  error,
  onToggle,
  onStash,
  onUnstash,
  onMemorySaved,
}: {
  event: EraEvent;
  isStashed: boolean;
  // E3 — 담은 사건의 본인 회상 (null=미입력). 안 담은 사건은 null.
  memoryContent: string | null;
  isExpanded: boolean;
  isBusy: boolean;
  error: string | undefined;
  onToggle: () => void;
  onStash: () => void;
  onUnstash: () => void;
  // E3 — 회상 저장/비움 성공 시 부모 맵 동기화 (옵티미스틱 일관).
  onMemorySaved: (newContent: string | null) => void;
}) {
  const monthLabel = event.month != null ? `${event.month}월` : null;
  // border-l-4 스트립은 li에 고정 (담김 여부 무관). 배경 워시는 내부 div 분리 —
  // li overflow-hidden 이 left border 4px 를 덮지 않도록.
  const decadeKey = decadeOf(event.year);
  const stripClass = decadeKey ? DECADE_STRIP_CLASS[decadeKey] : "border-l-zinc-200";
  const borderClass = isStashed
    ? "border-t-2 border-r-2 border-b-2 border-t-emerald-300 border-r-emerald-300 border-b-emerald-300 border-l-4 " + stripClass
    : "border-t-2 border-r-2 border-b-2 border-t-line border-r-line border-b-line border-l-4 " + stripClass;
  const bgClass = isStashed ? "bg-emerald-50/60" : "bg-surface";
  const detailId = `era-detail-${event.id}`;
  const SectionIcon = SECTION_ICON[event.section];
  return (
    <li className={`overflow-hidden rounded-md ${borderClass}`}>
      <div className={bgClass}>
      {/* 헤더 — 전체가 클릭 영역. min-h 56px (시니어 터치 친화). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={detailId}
        className="flex w-full min-h-[56px] items-center gap-3 px-4 py-3 text-left hover:bg-canvas/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-inset"
      >
        <SectionIcon
          aria-hidden="true"
          className={`shrink-0 h-5 w-5 ${SECTION_ICON_CLASS[event.section]}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-bold leading-snug text-ink sm:text-xl">
              {event.title}
            </span>
            {monthLabel && (
              <span className="text-sm text-ink-faint">({monthLabel})</span>
            )}
            {event.confidence === "APPROX" && (
              <span className="text-xs text-ink-faint">추정</span>
            )}
          </div>
        </div>
        <span
          className={
            "shrink-0 inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold " +
            SECTION_BADGE_CLASS[event.section]
          }
        >
          {SECTION_LABEL[event.section]}
        </span>
        {isStashed && (
          <span
            aria-label="내 연혁에 담음"
            title="내 연혁에 담음"
            className="shrink-0 text-base font-bold text-success-deep"
          >
            ✓
          </span>
        )}
        <span
          aria-hidden
          className={
            "shrink-0 text-ink-faint transition-transform duration-200 " +
            (isExpanded ? "rotate-180" : "")
          }
        >
          ▼
        </span>
      </button>

      {/* 펼침 영역 — grid-rows 트릭으로 부드럽게. */}
      <div
        id={detailId}
        className={
          "grid transition-[grid-template-rows] duration-200 ease-out " +
          (isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 border-t-2 border-line px-4 py-4">
            {event.description && (
              <p className="text-base leading-relaxed text-ink-soft sm:text-lg">
                {event.description}
              </p>
            )}
            {event.source && (
              <p className="text-xs text-ink-faint">출처: {event.source}</p>
            )}

            {/* 구글 검색 링크 — 모든 사건에 표시. 위키·뉴스·백과 위주라 참사·
                테러 같은 민감 사건도 안전한 "더 알아보기" 진입. 새 탭. 음악의
                유튜브(rose)와 구분되는 sky 톤으로 "정보 찾기" 느낌. */}
            <a
              href={googleSearchHref(event.title)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${event.title} 구글에서 더 알아보기 (새 탭)`}
              className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-md border-2 border-brand bg-banner px-4 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Search strokeWidth={1.75} aria-hidden className="h-5 w-5 text-action" />
              구글에서 더 알아보기
            </a>


            {/* E3 — 담은 사건만 본인 회상 입력 영역 노출. 안 담은 사건은
                "담아야 적을 수 있다" 정책 (saveEraMemory 의 not_stashed 가드와
                일치). 회상 영역은 양쪽(/era·/life-timeline) 공통 컴포넌트. */}
            {isStashed && (
              <EraMemoryEditor
                eventTitle={event.title}
                monthEventId={event.id}
                initialContent={memoryContent}
                onSaved={onMemorySaved}
              />
            )}

            {/* E2 — 담기 / 담음 토글. 시니어 친화 위해 큰 버튼 + 한 문장 안내. */}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              {isStashed ? (
                <>
                  <p className="text-base font-semibold text-success-deep">
                    <span aria-hidden>✓ </span>내 연혁에 있어요
                  </p>
                  <button
                    type="button"
                    onClick={onUnstash}
                    disabled={isBusy}
                    className={buttonClasses("plain", "md")}
                  >
                    내 연혁에서 빼기
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-soft">
                    기억나는 사건이면 내 연혁에 담아두세요.
                  </p>
                  <button
                    type="button"
                    onClick={onStash}
                    disabled={isBusy}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-md border border-brand bg-surface px-5 py-2 text-base font-bold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </div>
      </div>
      </div>
    </li>
  );
}

function EraSongCard({ song }: { song: EraSong }) {
  const when =
    song.month != null ? `${song.year}년 ${song.month}월` : `${song.year}년`;
  const originLabel = song.origin === "DOMESTIC" ? "국내" : "해외";
  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink-soft">{when}</span>
        <span className="inline-flex items-center rounded-full border-2 border-brand bg-banner px-2 py-0.5 text-xs font-semibold text-action">
          {originLabel}
        </span>
      </div>
      <p className="text-lg font-bold leading-snug text-ink sm:text-xl">
        {song.title}
      </p>
      <p className="text-base text-ink-soft">{song.artist}</p>
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
