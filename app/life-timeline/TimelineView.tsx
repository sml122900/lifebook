"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { calcAge } from "@/lib/age";
import type { LifeEvent } from "@/lib/life-events";

// Phase L3 (v3.2) — 세로 타임라인.
//
// 데스크톱(sm+): 중앙 세로 베이스선 + 좌우 교차 카드 (짝수 우, 홀수 좌)
// 모바일(sm-):   왼쪽 세로 베이스선 + 우측 카드 (한쪽으로만)
//
// 점 시각: EXACT 큰 채움 amber-600 / APPROXIMATE 작은 점선 amber-100.
// 사이 이벤트 기본 월: 6월("그해 중반" 진입점).
//
// 기간(endYear): 시각화 단계에서만 두 점으로 split. 시작·끝 사이는 amber-500
// 두꺼운 선으로 채워 시선 끊김 방지.
//
// 라벨에 (만 N세) 곁들임 — birthYear 가 있을 때.
//
// v3.3 — 빈 공간으로 이야기 추가:
//   1) 선 ±20px 폭의 click area 가 onClick 으로 Y 비율 → 연도 추정 →
//      /life-timeline/add?year=YYYY&hint=1
//   2) 각 점 옆 amber + 버튼 (데스크톱: group-hover 시 표시, 모바일: 항상).
//      → /life-timeline/add?year=eventYear (이 사건 근처에 추가).
//   - 클라이언트 컴포넌트로 전환(useRouter 필요). 점/카드는 Link 라 그대로.
//   - pointer-events: ol/li 는 none, 점·카드·+버튼은 auto → ol 빈 영역
//     클릭은 line click area 로 통과.

const APPROX_DEFAULT_MONTH = 6;

type RenderEvent = LifeEvent & { isPeriodEnd?: boolean };

function expandPeriods(events: LifeEvent[]): RenderEvent[] {
  const expanded: RenderEvent[] = [];
  for (const e of events) {
    if (e.endYear != null && e.endYear !== e.eventYear) {
      expanded.push({ ...e });
      expanded.push({
        ...e,
        id: `${e.id}:end`,
        eventYear: e.endYear,
        eventMonth: null,
        precision: "APPROXIMATE",
        isPeriodEnd: true,
      });
    } else {
      expanded.push({ ...e });
    }
  }
  return expanded.sort((a, b) => timeKey(a) - timeKey(b));
}

function timeKey(e: LifeEvent): number {
  if (e.eventMonth != null) {
    return e.eventYear + (e.eventMonth - 1) / 12;
  }
  return e.eventYear + 0.5;
}

function formatWhen(e: LifeEvent): string {
  if (e.precision === "EXACT" && e.eventMonth != null) {
    return `${e.eventYear}년 ${e.eventMonth}월`;
  }
  if (e.precision === "EXACT") {
    return `${e.eventYear}년`;
  }
  return `${e.eventYear}년쯤`;
}

function formatTitle(e: RenderEvent): string {
  if (e.isPeriodEnd) return `${e.title} 끝`;
  return e.title;
}

function formatAgeSuffix(e: LifeEvent, birthYear: number | null): string {
  if (birthYear === null) return "";
  const age = calcAge(birthYear, e.eventYear);
  if (!age) return "";
  return ` (만 ${age.manAge}세)`;
}

function timemachineHref(e: LifeEvent): string {
  const month = e.eventMonth ?? APPROX_DEFAULT_MONTH;
  return `/timemachine/${e.eventYear}/${month}`;
}

function addNearHref(year: number): string {
  // hint 는 안내 표시 신호. + 버튼은 사용자가 명시적으로 그 연도 즈음을 가리킨
  // 경우라 굳이 안내가 필요 없지만, 빈 공간 클릭과 같은 안내 흐름으로 통일.
  return `/life-timeline/add?year=${year}&hint=1`;
}

type PeriodFlag = { topHalf: boolean; bottomHalf: boolean };

function computePeriodFlags(events: RenderEvent[]): PeriodFlag[] {
  const flags: PeriodFlag[] = events.map(() => ({
    topHalf: false,
    bottomHalf: false,
  }));
  const startIdx = new Map<string, number>();

  events.forEach((e, idx) => {
    if (e.isPeriodEnd) {
      const origId = e.id.slice(0, -4);
      const s = startIdx.get(origId);
      if (s === undefined) return;
      flags[s].bottomHalf = true;
      for (let i = s + 1; i < idx; i++) {
        flags[i].topHalf = true;
        flags[i].bottomHalf = true;
      }
      flags[idx].topHalf = true;
    } else if (e.endYear != null && e.endYear !== e.eventYear) {
      startIdx.set(e.id, idx);
    }
  });

  return flags;
}

// v3.3 — 빈 공간 클릭을 받기 위한 연도 범위. 모든 RenderEvent 의 eventYear
// 만으로 충분(끝 점은 endYear 가 eventYear 로 미러됨). 단일 시점이면 그 연도.
function computeYearRange(events: RenderEvent[]): {
  min: number;
  max: number;
} {
  const years = events.map((e) => e.eventYear);
  return { min: Math.min(...years), max: Math.max(...years) };
}

export function TimelineView({
  events,
  birthYear = null,
}: {
  events: LifeEvent[];
  birthYear?: number | null;
}) {
  const renderEvents = expandPeriods(events);
  const flags = computePeriodFlags(renderEvents);
  const yearRange = computeYearRange(renderEvents);
  const eventCount = events.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="hidden sm:block">
        <DesktopTimeline
          events={renderEvents}
          flags={flags}
          birthYear={birthYear}
          yearRange={yearRange}
        />
      </div>
      <div className="sm:hidden">
        <MobileTimeline
          events={renderEvents}
          flags={flags}
          birthYear={birthYear}
          yearRange={yearRange}
        />
      </div>

      {eventCount > 0 && eventCount < 5 && (
        <p className="text-center text-base text-zinc-600">
          이벤트를 더 채울수록 인생 연혁이 풍성해져요.
        </p>
      )}

      <Legend />
    </div>
  );
}

// 데스크톱 — 중앙 세로선 + 좌우 교차 카드.
function DesktopTimeline({
  events,
  flags,
  birthYear,
  yearRange,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
}) {
  return (
    // pointer-events-none: 빈 영역 클릭이 LineClickArea 로 통과.
    // 점·카드·+버튼은 각자 pointer-events-auto 로 부활.
    <ol className="pointer-events-none relative py-4">
      {/* 중앙 베이스선 (옅은 amber) */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-amber-100"
      />

      {/* 빈 공간 클릭 영역 — 중앙선 좌우 ±20px */}
      <LineClickArea
        position="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-10"
        yearRange={yearRange}
      />

      {events.map((e, i) => {
        const cardSide: "left" | "right" = i % 2 === 0 ? "right" : "left";
        const flag = flags[i];
        return (
          <TimelineRow
            key={e.id}
            e={e}
            flag={flag}
            birthYear={birthYear}
            layout="desktop"
            cardSide={cardSide}
          />
        );
      })}
    </ol>
  );
}

// 모바일 — 왼쪽 세로선 + 우측 카드만.
function MobileTimeline({
  events,
  flags,
  birthYear,
  yearRange,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
}) {
  return (
    <ol className="pointer-events-none relative py-3">
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-4 w-1 rounded-full bg-amber-100"
      />

      {/* 빈 공간 클릭 영역 — 왼쪽 선 좌우 ±20px */}
      <LineClickArea
        position="absolute top-0 bottom-0 left-4 -translate-x-1/2 w-10"
        yearRange={yearRange}
      />

      {events.map((e, i) => {
        const flag = flags[i];
        return (
          <TimelineRow
            key={e.id}
            e={e}
            flag={flag}
            birthYear={birthYear}
            layout="mobile"
            cardSide="right"
          />
        );
      })}
    </ol>
  );
}

// 한 행 — 데스크톱/모바일 공통. layout 으로 점/카드/연결선 위치 분기.
function TimelineRow({
  e,
  flag,
  birthYear,
  layout,
  cardSide,
}: {
  e: RenderEvent;
  flag: PeriodFlag;
  birthYear: number | null;
  layout: "desktop" | "mobile";
  cardSide: "left" | "right";
}) {
  const exact = e.precision === "EXACT";
  const aria = `${formatWhen(e)} ${formatTitle(e)} — 그 시기의 타임머신 열기`;

  // 점이 놓인 라인의 가로 위치 (절대 위치 기준).
  const pointAtClass =
    layout === "mobile" ? "left-4 -translate-x-1/2" : "left-1/2 -translate-x-1/2";
  // 기간 강조선의 가로 위치.
  const periodBarAt = layout === "mobile" ? "left-4" : "left-1/2 -translate-x-1/2";

  return (
    <li
      className={
        layout === "mobile"
          ? "relative grid min-h-[96px] grid-cols-[2.5rem_1fr] items-center"
          : "relative grid min-h-[112px] grid-cols-2 items-center"
      }
    >
      {/* 좌측 카드 영역 (데스크톱 전용) */}
      {layout === "desktop" && (
        <div className="flex items-center justify-end pr-14">
          {cardSide === "left" && (
            <div className="pointer-events-auto">
              <EventCard e={e} align="right" birthYear={birthYear} />
            </div>
          )}
        </div>
      )}

      {/* 우측 카드 영역 — 데스크톱: 카드 cardSide==="right" 일 때만 / 모바일: 항상 */}
      <div
        className={
          layout === "mobile"
            ? "col-start-2 flex items-center pl-10"
            : "flex items-center justify-start pl-14"
        }
      >
        {(layout === "mobile" || cardSide === "right") && (
          <div className="pointer-events-auto">
            <EventCard e={e} align="left" birthYear={birthYear} />
          </div>
        )}
      </div>

      {/* 기간 강조선 (중앙선 위에 덮어쓰기) */}
      {flag.topHalf && (
        <div
          aria-hidden
          className={`absolute top-0 bottom-1/2 ${periodBarAt} w-1 bg-amber-500`}
        />
      )}
      {flag.bottomHalf && (
        <div
          aria-hidden
          className={`absolute top-1/2 bottom-0 ${periodBarAt} w-1 bg-amber-500`}
        />
      )}

      {/* 짧은 연결선 (점 → 카드 방향) */}
      <div
        aria-hidden
        className={
          layout === "mobile"
            ? "absolute top-1/2 left-4 ml-3 h-0.5 w-6 -translate-y-1/2 bg-amber-300"
            : "absolute top-1/2 h-0.5 w-10 -translate-y-1/2 bg-amber-300 " +
              (cardSide === "right" ? "left-1/2 ml-3" : "right-1/2 mr-3")
        }
      />

      {/* 점 + + 버튼 그룹 — group 으로 묶어 데스크톱 hover 시 + 노출 */}
      <div
        className={`group pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 ${pointAtClass}`}
      >
        {/* 점 — Link 로 클릭 (월별 타임머신) */}
        <Link
          href={timemachineHref(e)}
          aria-label={aria}
          className="pointer-events-auto relative block rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <span
            aria-hidden
            className={
              "block rounded-full border-2 " +
              (exact
                ? "h-6 w-6 border-amber-800 bg-amber-600"
                : "h-4 w-4 border-amber-400 border-dashed bg-amber-100")
            }
          />
        </Link>

        {/* + 버튼 — 이 사건 근처에 새 이야기 추가 */}
        <Link
          href={addNearHref(e.eventYear)}
          aria-label={`${e.eventYear}년 즈음에 새 이야기 추가하기`}
          className={
            "pointer-events-auto absolute top-1/2 left-full z-20 ml-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-100 text-2xl font-bold text-amber-800 transition-opacity hover:bg-amber-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
            // 모바일은 항상 표시, 데스크톱은 그룹 호버/포커스 시 표시
            (layout === "mobile"
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")
          }
        >
          <span aria-hidden>+</span>
        </Link>
      </div>
    </li>
  );
}

// 좌·우 어느 방향이든 동일한 카드. align 으로 텍스트 정렬만 바꿈.
function EventCard({
  e,
  align,
  birthYear,
}: {
  e: RenderEvent;
  align: "left" | "right";
  birthYear: number | null;
}) {
  const exact = e.precision === "EXACT";
  const ageSuffix = formatAgeSuffix(e, birthYear);
  const displayTitle = formatTitle(e);
  const aria = `${formatWhen(e)} ${displayTitle} — 그 시기의 타임머신 열기`;

  return (
    <Link
      href={timemachineHref(e)}
      aria-label={aria}
      className={
        "block w-full max-w-[18rem] rounded-md border-2 px-4 py-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
        (exact ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white") +
        (align === "right" ? " text-right" : " text-left")
      }
    >
      <p
        className={
          "text-sm " +
          (exact ? "font-semibold text-amber-800" : "text-zinc-500")
        }
      >
        {formatWhen(e)}
        {ageSuffix && (
          <span className="ml-1 text-xs text-zinc-500">{ageSuffix}</span>
        )}
      </p>
      <p
        className={
          "mt-1 leading-tight " +
          (exact
            ? "text-base font-bold text-zinc-900"
            : "text-base font-medium text-zinc-700")
        }
      >
        {displayTitle}
      </p>
    </Link>
  );
}

// v3.3 — 선 ±20px 폭의 클릭 area. 클릭 위치 Y → 비율 → 연도 추정 → router.push.
// pointer-events-auto 라 점·카드 위 클릭은 점·카드가 가로채고, 빈 곳만 도달.
function LineClickArea({
  position,
  yearRange,
}: {
  position: string;
  yearRange: { min: number; max: number };
}) {
  const router = useRouter();
  const handler = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height === 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const year =
      yearRange.min === yearRange.max
        ? yearRange.min
        : Math.round(
            yearRange.min + ratio * (yearRange.max - yearRange.min),
          );
    router.push(`/life-timeline/add?year=${year}&hint=1`);
  };

  return (
    <button
      type="button"
      onClick={handler}
      aria-label="빈 자리를 눌러 이 시기에 이야기 추가하기"
      title="이 자리를 눌러 이야기 추가"
      className={
        // pointer-events-auto: ol 의 -none 을 뚫고 클릭 받음.
        "pointer-events-auto cursor-pointer rounded-md hover:bg-amber-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 " +
        position
      }
    />
  );
}

// 점·기간 색 의미 안내.
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border-2 border-zinc-200 bg-white px-4 py-3 text-base text-zinc-700">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-5 w-5 rounded-full border-2 border-amber-800 bg-amber-600"
        />
        정확한 시점
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-4 w-4 rounded-full border-2 border-amber-400 border-dashed bg-amber-100"
        />
        대략적인 시점
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-6 w-1 rounded-full bg-amber-500"
        />
        기간
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-100 text-base font-bold text-amber-800"
        >
          +
        </span>
        이야기 추가
      </span>
      <span className="text-zinc-500">
        점은 그 시기로, 빈 자리는 새 이야기로
      </span>
    </div>
  );
}
