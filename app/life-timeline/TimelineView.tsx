"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { calcAge } from "@/lib/age";
import type { LifeEvent } from "@/lib/life-events";

import {
  PeopleConnectModal,
  type PersonLite,
} from "./PeopleConnectModal";

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

// H4 — id slice 매직 제거. originalId 를 명시 필드로. isPeriodEnd 행도
// originalId === 시작 행의 id 라 lookup 가 명확.
type RenderEvent = LifeEvent & {
  isPeriodEnd?: boolean;
  originalId: string;
};

// H5 — 정렬 제거. DB 가 (year ASC, month NULLS LAST, createdAt ASC) 로
// 이미 보내준 순서를 그대로 보존하고, endYear 가 있는 행만 "끝" 점을 그
// 위치에 끼워 넣는다. 끝 점은 같은 originalId 의 시작 행 직후에 두고,
// 더 정확한 위치 정렬은 DB 가 보낸 순서 안에서 자연스럽게 처리되게 둔다.
//
// 정책: 끝 행 자체도 시작 행 뒤에 일렬로 배치되면 같은 그룹으로 묶여
// computePeriodFlags 가 끊김 없이 강조선을 칠 수 있다. 다른 이벤트가 끼어
// 있는 경우(시작 → 중간 → 끝) 도 인덱스 기반으로 처리되므로 OK.
function expandPeriods(events: LifeEvent[]): RenderEvent[] {
  const expanded: RenderEvent[] = [];
  // 끝 점을 끼워야 할 위치 찾기 위해 endYear 기준으로 보류 — 시작 행을
  // 그대로 넣고, DB 순서를 훑으며 적절한 위치(다음 큰 시점)에 도달하면
  // 끝 점 삽입. 시작점만 있고 끝점이 시작과 같은 해면 split 안 함.
  type Pending = { startIdx: number; endYear: number; src: LifeEvent };
  const pending: Pending[] = [];

  function flushPendingBefore(year: number, month: number | null) {
    // year/month 가 pending 끝 시점보다 큰 경우 모두 flush.
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      const reachedYear = year > p.endYear;
      // 같은 해 안에서는 정확월/사이이벤트 무관하게 끝 점이 먼저 와야 함 —
      // DB 순서가 month ASC NULLS LAST 라 정확월이 앞. 끝 점은 month=null
      // 로 두므로 같은 해의 정확월보다는 뒤, 사이이벤트 직전~사이 위치.
      // 단순화를 위해 endYear 보다 같거나 큰 첫 시점에서 flush.
      if (reachedYear) {
        expanded.push({
          ...p.src,
          id: `${p.src.id}--end`,
          originalId: p.src.id,
          eventYear: p.endYear,
          eventMonth: null,
          precision: "APPROXIMATE",
          isPeriodEnd: true,
        });
        pending.splice(i, 1);
      }
    }
    // 같은 해 안의 미세 위치 조정은 위에서 다루지 않음 — DB 순서 우선.
    void month; // 미사용 가드 (미래에 month-level flush 필요 시 활용)
  }

  for (const e of events) {
    flushPendingBefore(e.eventYear, e.eventMonth);
    expanded.push({ ...e, originalId: e.id });
    if (e.endYear != null && e.endYear !== e.eventYear) {
      pending.push({ startIdx: expanded.length - 1, endYear: e.endYear, src: e });
    }
  }
  // 남은 pending — 더 큰 시점 이벤트가 없으면 그대로 뒤에 붙임.
  for (const p of pending) {
    expanded.push({
      ...p.src,
      id: `${p.src.id}--end`,
      originalId: p.src.id,
      eventYear: p.endYear,
      eventMonth: null,
      precision: "APPROXIMATE",
      isPeriodEnd: true,
    });
  }
  return expanded;
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

// 2026-06-06: 월 단위 회고를 메인 동선에서 뺐으므로 점·카드 클릭은
// 이벤트의 편집 화면(이야기·장소·인물 통합)으로 보낸다. isPeriodEnd 행도
// 원본 이벤트(originalId)의 편집으로 — "끝" 점을 눌러도 같은 이야기를 연다.
function editHref(e: RenderEvent): string {
  return `/life-timeline/${e.originalId}/edit`;
}

// 외부 지도 새 탭 URL. placeSource 별로 분기:
//   naver  : 검색 URL — https://map.naver.com/p/search/{placeName}
//   google : lat/lng 가 있으면 좌표, 없으면 검색 URL
//   기타   : 구글 검색으로 폴백
function externalMapHref(place: LifeEvent["place"]): string | null {
  if (!place.placeName) return null;
  const q = encodeURIComponent(place.placeName);
  if (place.placeSource === "naver") {
    return `https://map.naver.com/p/search/${q}`;
  }
  if (
    place.placeSource === "google" &&
    place.lat !== null &&
    place.lng !== null
  ) {
    return `https://maps.google.com/?q=${place.lat},${place.lng}`;
  }
  return `https://maps.google.com/?q=${q}`;
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
      const s = startIdx.get(e.originalId);
      if (s === undefined) return;
      flags[s].bottomHalf = true;
      for (let i = s + 1; i < idx; i++) {
        flags[i].topHalf = true;
        flags[i].bottomHalf = true;
      }
      flags[idx].topHalf = true;
    } else if (e.endYear != null && e.endYear !== e.eventYear) {
      startIdx.set(e.originalId, idx);
    }
  });

  return flags;
}

// v3.3 — 빈 공간 클릭을 받기 위한 연도 범위. 모든 RenderEvent 의 eventYear
// 만으로 충분(끝 점은 endYear 가 eventYear 로 미러됨). 단일 시점이면 그 연도.
// H6 — 빈 배열이면 Math.min(...[]) = +Infinity 라 NaN 으로 push 됨. 현재
// 연도를 기본값으로 — 호출자가 가드 빼더라도 안전.
function computeYearRange(events: RenderEvent[]): {
  min: number;
  max: number;
} {
  if (events.length === 0) {
    const now = new Date().getFullYear();
    return { min: now, max: now };
  }
  const years = events.map((e) => e.eventYear);
  return { min: Math.min(...years), max: Math.max(...years) };
}

// 인물 미리보기 — RSC 가 prefetch 한 (memoryId → 인물 이름 목록) 을 그대로
// 받는다. Map 은 RSC→client 직렬화가 안 되므로 plain object 로 전달.
// isPeriodEnd 행은 id 가 "원본id:end" 라 원본 id 를 lookup key 로 쓴다.
export type PeopleByEvent = Record<string, { id: string; name: string }[]>;

// H4 — originalId 필드로 대체. 기존 origMemoryId(e.id.slice(0,-4)) 제거.

export function TimelineView({
  events,
  birthYear = null,
  peopleByEvent = {},
  allPeople = [],
}: {
  events: LifeEvent[];
  birthYear?: number | null;
  peopleByEvent?: PeopleByEvent;
  // P3 — 사용자 전체 인물 목록. 팝오버가 열릴 때마다 fetch 하지 않도록 미리.
  allPeople?: PersonLite[];
}) {
  const renderEvents = expandPeriods(events);
  const flags = computePeriodFlags(renderEvents);
  const yearRange = computeYearRange(renderEvents);
  const eventCount = events.length;

  // P3 — 모달 + 옵티미스틱 chip 동기화 상태.
  // peopleByEvent prop 은 RSC fetch 결과(스냅샷). 모달에서 토글하면 즉시
  // 화면에 반영하려고 state 로 복제. router.refresh() 가 떨어지면 prop 이
  // 다시 들어오는데, 새 사용자 토글이 있으면 그쪽이 우선 — 단순화를 위해
  // mount 시 1회만 init 하고 이후 모달 콜백으로만 갱신.
  const [peopleState, setPeopleState] =
    useState<PeopleByEvent>(peopleByEvent);
  const [openModal, setOpenModal] = useState<{
    memoryId: string;
    label: string;
  } | null>(null);

  function openFor(e: RenderEvent) {
    setOpenModal({ memoryId: e.originalId, label: formatTitle(e) });
  }

  function handleConnectedChange(memoryId: string, connected: PersonLite[]) {
    setPeopleState((prev) => ({ ...prev, [memoryId]: connected }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="hidden sm:block">
        <DesktopTimeline
          events={renderEvents}
          flags={flags}
          birthYear={birthYear}
          yearRange={yearRange}
          peopleByEvent={peopleState}
          onOpenPeople={openFor}
        />
      </div>
      <div className="sm:hidden">
        <MobileTimeline
          events={renderEvents}
          flags={flags}
          birthYear={birthYear}
          yearRange={yearRange}
          peopleByEvent={peopleState}
          onOpenPeople={openFor}
        />
      </div>

      {eventCount > 0 && eventCount < 5 && (
        <p className="text-center text-base text-zinc-600">
          이벤트를 더 채울수록 인생 연혁이 풍성해져요.
        </p>
      )}

      <Legend />

      {openModal && (
        <PeopleConnectModal
          memoryId={openModal.memoryId}
          eventLabel={openModal.label}
          allPeople={allPeople}
          initialConnected={peopleState[openModal.memoryId] ?? []}
          onClose={() => setOpenModal(null)}
          onConnectedChange={handleConnectedChange}
        />
      )}
    </div>
  );
}

// 데스크톱 — 중앙 세로선 + 좌우 교차 카드.
function DesktopTimeline({
  events,
  flags,
  birthYear,
  yearRange,
  peopleByEvent,
  onOpenPeople,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
  peopleByEvent: PeopleByEvent;
  onOpenPeople: (e: RenderEvent) => void;
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
            people={peopleByEvent[e.originalId] ?? []}
            onOpenPeople={onOpenPeople}
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
  peopleByEvent,
  onOpenPeople,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
  peopleByEvent: PeopleByEvent;
  onOpenPeople: (e: RenderEvent) => void;
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
            people={peopleByEvent[e.originalId] ?? []}
            onOpenPeople={onOpenPeople}
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
  people,
  onOpenPeople,
}: {
  e: RenderEvent;
  flag: PeriodFlag;
  birthYear: number | null;
  layout: "desktop" | "mobile";
  cardSide: "left" | "right";
  people: { id: string; name: string }[];
  onOpenPeople: (e: RenderEvent) => void;
}) {
  const exact = e.precision === "EXACT";
  const aria = `${formatWhen(e)} ${formatTitle(e)} — 이 이야기 편집하기`;

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
            <div className="pointer-events-auto flex flex-col items-end">
              <EventCard
                e={e}
                align="right"
                birthYear={birthYear}
                onOpenPeople={() => onOpenPeople(e)}
              />
              <PlacePreview place={e.place} align="right" />
              <PeoplePreview
                people={people}
                align="right"
                onClick={() => onOpenPeople(e)}
              />
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
          <div className="pointer-events-auto flex flex-col items-start">
            <EventCard
              e={e}
              align="left"
              birthYear={birthYear}
              onOpenPeople={() => onOpenPeople(e)}
            />
            <PlacePreview place={e.place} align="left" />
            <PeoplePreview
              people={people}
              align="left"
              onClick={() => onOpenPeople(e)}
            />
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
        {/* 점 — Link 로 클릭 (이야기 편집 화면) */}
        <Link
          href={editHref(e)}
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
//
// P3 — 카드 안에 "👤 인물 연결" 버튼 추가. <a> 안에 <button> 은 invalid HTML
// 이라 Link 와 버튼을 형제로 분리 + relative wrapper. 버튼은 absolute 로
// 카드 우상단(혹은 좌상단)에 띄우고 z-index 로 Link 위. 카드 본문 텍스트
// 영역은 그대로 Link 라 카드 클릭 = 월별 타임머신 이동 동작 유지.
function EventCard({
  e,
  align,
  birthYear,
  onOpenPeople,
}: {
  e: RenderEvent;
  align: "left" | "right";
  birthYear: number | null;
  onOpenPeople: () => void;
}) {
  const exact = e.precision === "EXACT";
  const ageSuffix = formatAgeSuffix(e, birthYear);
  const displayTitle = formatTitle(e);
  const aria = `${formatWhen(e)} ${displayTitle} — 이 이야기 편집하기`;
  // 버튼 위치: 카드의 텍스트 정렬 반대 모서리에 두면 카드 텍스트와 안 겹침.
  // align="right" (좌 카드) → 버튼은 좌상단 / align="left" (우 카드) → 우상단.
  const btnCorner =
    align === "right" ? "top-2 left-2" : "top-2 right-2";

  return (
    <div className="relative w-full max-w-[18rem]">
      <Link
        href={editHref(e)}
        aria-label={aria}
        className={
          "block w-full rounded-md border-2 px-4 py-3 pr-12 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
          (exact ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white") +
          (align === "right" ? " pl-12 pr-4 text-right" : " text-left")
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
      <button
        type="button"
        onClick={onOpenPeople}
        aria-label={`${displayTitle} — 함께한 인물 연결`}
        title="함께한 인물 연결"
        className={
          "absolute z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-300 bg-white text-lg shadow-sm hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 " +
          btnCorner
        }
      >
        <span aria-hidden>👤</span>
      </button>
    </div>
  );
}

// 장소 미리보기 — 카드 아래 "📍 강원도 춘천" 작은 글씨. placeName 없으면
// 렌더 X. 칩은 외부 a 태그 (target=_blank) — 카드 Link 와 다른 동작이라
// 부모 카드 Link 와 충돌 없음(별도 형제).
function PlacePreview({
  place,
  align,
}: {
  place: LifeEvent["place"];
  align: "left" | "right";
}) {
  if (!place.placeName) return null;
  const href = externalMapHref(place);
  const sourceLabel =
    place.placeSource === "naver"
      ? "네이버 지도"
      : place.placeSource === "google"
        ? "구글 지도"
        : "지도";
  const className =
    "mt-1 max-w-[18rem] text-xs leading-snug text-zinc-600 hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
    (align === "right" ? "text-right" : "text-left");
  const content = (
    <>
      <span aria-hidden>📍 </span>
      {place.placeName}
    </>
  );
  if (!href) {
    return <span className={className}>{content}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${place.placeName} — ${sourceLabel} 새 탭으로 열기`}
      title={`${sourceLabel}에서 열기`}
      className={className}
    >
      {content}
    </a>
  );
}

// 인물 미리보기 칩 — 카드 바로 아래 작은 글씨. 없으면 렌더 X.
// P3:
//   - 4명 초과면 "철수, 영희 외 N명" 으로 압축.
//   - 칩 자체가 button — 클릭 시 인물 연결 모달 열림(진입점 하나 더).
const PREVIEW_LIMIT = 3;

function compressNames(
  people: { id: string; name: string }[],
): string {
  if (people.length <= PREVIEW_LIMIT + 1) {
    return people.map((p) => p.name).join(", ");
  }
  const head = people.slice(0, PREVIEW_LIMIT).map((p) => p.name).join(", ");
  const rest = people.length - PREVIEW_LIMIT;
  return `${head} 외 ${rest}명`;
}

function PeoplePreview({
  people,
  align,
  onClick,
}: {
  people: { id: string; name: string }[];
  align: "left" | "right";
  onClick: () => void;
}) {
  if (people.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`함께한 분 ${people.length}명 — 인물 연결 열기`}
      className={
        "mt-1 max-w-[18rem] rounded-md text-xs leading-snug text-zinc-600 hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      <span aria-hidden>👤 </span>
      {compressNames(people)}
    </button>
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
