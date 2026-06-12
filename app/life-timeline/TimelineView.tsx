"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition } from "react";

import { Camera, FolderOpen, MapPin, Pencil, User } from "lucide-react";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import { unstashEraEventAction } from "@/app/era/actions";
import { buttonClasses } from "@/components/ui/Button";
import { EraMemoryEditor } from "@/app/era/EraMemoryEditor";
import {
  movePhotoToEventAction,
  updatePhotoPlaceAction,
} from "@/app/photos/actions";
import { calcAge } from "@/lib/age";
import {
  SECTION_BADGE_CLASS,
  SECTION_LABEL,
} from "@/lib/era-labels";
import type { LifeEvent } from "@/lib/life-events";
import { type PlaceInfo } from "@/lib/place-types";

import {
  PeopleConnectModal,
  type PersonLite,
} from "./PeopleConnectModal";

// Phase L3 (v3.2) — 세로 타임라인.
//
// 데스크톱(sm+): 중앙 세로 베이스선 + 좌우 교차 카드 (짝수 우, 홀수 좌)
// 모바일(sm-):   왼쪽 세로 베이스선 + 우측 카드 (한쪽으로만)
//
// 점 시각: EXACT 큰 채움 action / APPROXIMATE 작은 점선 amber-100.
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
// E2 — kind 는 LifeEvent 에서 그대로 상속 ("life_event" | "era_event").
type RenderEvent = LifeEvent & {
  isPeriodEnd?: boolean;
  // Phase Photo (4단계+) — split 된 기간의 "시작" 행 표식. PhotoStrip 이
  // 앵커 필터(시작 점=start/both)에 사용. 단일 점은 둘 다 false → 전부 표시.
  isPeriodStart?: boolean;
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
  type Pending = {
    startIdx: number;
    endYear: number;
    endMonth: number | null;
    src: LifeEvent;
  };
  const pending: Pending[] = [];

  function makeEndRow(p: Pending): RenderEvent {
    return {
      ...p.src,
      id: `${p.src.id}--end`,
      originalId: p.src.id,
      eventYear: p.endYear,
      // 2026-06-07 — endMonth 가 있으면 끝 점도 그 월에 자리. precision 도 EXACT.
      eventMonth: p.endMonth,
      precision: p.endMonth != null ? "EXACT" : "APPROXIMATE",
      isPeriodEnd: true,
    };
  }

  // M3 — 같은 해 안에서도 endMonth 가 있으면 month 비교로 위치 결정.
  // endMonth 없는 끝점은 정책 유지 (같은 해 모든 사건 뒤에 자연 push).
  function flushPendingBefore(year: number, month: number | null) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (year > p.endYear) {
        expanded.push(makeEndRow(p));
        pending.splice(i, 1);
        continue;
      }
      // 같은 해 + 끝점 endMonth 가 도착한 사건의 month 보다 이르다 → 끝점 먼저.
      if (
        year === p.endYear &&
        p.endMonth != null &&
        month != null &&
        month > p.endMonth
      ) {
        expanded.push(makeEndRow(p));
        pending.splice(i, 1);
      }
    }
  }

  for (const e of events) {
    flushPendingBefore(e.eventYear, e.eventMonth);
    expanded.push({ ...e, originalId: e.id });
    // M2 — 같은 해라도 endMonth 가 명시되면 끝점 별도 표시 (EXACT 큰 점).
    // endMonth null 인 단일해 기간(시작=끝)은 시각적 의미 없어 split 안 함.
    if (
      e.endYear != null &&
      (e.endYear !== e.eventYear || e.endMonth != null)
    ) {
      // 이 행은 split 되는 기간의 시작 점 → 표식(PhotoStrip 앵커 필터용).
      expanded[expanded.length - 1].isPeriodStart = true;
      pending.push({
        startIdx: expanded.length - 1,
        endYear: e.endYear,
        endMonth: e.endMonth,
        src: e,
      });
    }
  }
  // 남은 pending — 더 큰 시점 이벤트가 없으면 그대로 뒤에 붙임.
  for (const p of pending) {
    expanded.push(makeEndRow(p));
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
//
// E2 — era_event 는 클릭 비활성. 사용자가 직접 쓴 게 아니라 시대 자료를
// 담은 행이라 편집 의미 없음. 본인 회상 추가(content 채우기) UI 는 E3
// 후속. 점·카드 모두 Link 대신 div 로, 카드 하단에 "내 연혁에서 빼기" 만.
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
    } else if (
      e.endYear != null &&
      (e.endYear !== e.eventYear || e.endMonth != null)
    ) {
      // M2 — expandPeriods 의 split 조건과 동일하게. 같은 해 + endMonth
      // 있는 행도 시작-끝 사이를 amber 강조선으로 잇는다.
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

// Phase Photo (3단계) — RSC(page.tsx)가 발급한 (photoId → signed URL).
// getLifeEvents 가 경로만 들고 오므로 URL 은 이 prop 으로 주입된다. 발급에
// 실패한 사진은 키가 없어 썸네일만 누락(화면은 안 깨짐).
export type PhotoUrls = Record<string, string>;
// 라이트박스(보기 전용)에 띄울 한 장. 삭제는 /photos·편집 화면에서만.
type OpenPhoto = { url: string; caption: string | null; label: string };

// Phase Photo 6 (3단계) — 독립 사진 "사건에 넣기" 모달이 쓸 life_event 목록.
// 딥 네스팅(Row→EventNode→PhotoCard)에 핸들러를 스레딩하지 않고 Context 로
// 한 번에 제공. PhotoCard 가 자체 모달에서 소비(PhotoPlaceModal 패턴).
type LifeEventOption = {
  memoryId: string;
  title: string;
  year: number;
  month: number | null;
};
const LifeEventOptionsContext = createContext<LifeEventOption[]>([]);

// H4 — originalId 필드로 대체. 기존 origMemoryId(e.id.slice(0,-4)) 제거.

export function TimelineView({
  events,
  birthYear = null,
  peopleByEvent = {},
  allPeople = [],
  photoUrls = {},
}: {
  events: LifeEvent[];
  birthYear?: number | null;
  peopleByEvent?: PeopleByEvent;
  // P3 — 사용자 전체 인물 목록. 팝오버가 열릴 때마다 fetch 하지 않도록 미리.
  allPeople?: PersonLite[];
  // Phase Photo (3단계) — photoId → signed URL.
  photoUrls?: PhotoUrls;
}) {
  const router = useRouter();
  // E2 — 옵티미스틱 hide. era_event 행 빼기 클릭 시 즉시 화면에서 사라지고
  // server action 완료 후 router.refresh() 가 events prop 을 갱신. 실패하면
  // hidden 에서 제거 + 에러 표시(아래 EraRemoveButton).
  const [hiddenEraIds, setHiddenEraIds] = useState<Set<string>>(new Set());
  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenEraIds.has(e.id)),
    [events, hiddenEraIds],
  );
  const renderEvents = expandPeriods(visibleEvents);
  const flags = computePeriodFlags(renderEvents);
  const yearRange = computeYearRange(renderEvents);
  const eventCount = visibleEvents.length;

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
  // Phase Photo (3단계) — 라이트박스(보기 전용) 상태. 썸네일 클릭 시 채워짐.
  const [openPhoto, setOpenPhoto] = useState<OpenPhoto | null>(null);

  function openFor(e: RenderEvent) {
    // E2 — era_event 는 인물 연결 불허(시대 자료). lib/people.ts 의 not_linkable
    // 가드가 서버 측 단일 결정자지만, UI 에서 모달 진입 자체를 차단해 혼란 0.
    // B — photo 는 허용(독립 사진에 인물 연결). photo 메모리는 자기 memoryId.
    if (e.kind === "era_event") return;
    setOpenModal({ memoryId: e.originalId, label: formatTitle(e) });
  }

  function handleConnectedChange(memoryId: string, connected: PersonLite[]) {
    setPeopleState((prev) => ({ ...prev, [memoryId]: connected }));
  }

  // E2 — era 빼기 옵티미스틱 토글. 자식 컴포넌트가 호출.
  function hideEra(eventId: string) {
    setHiddenEraIds((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
  }
  function unhideEra(eventId: string) {
    setHiddenEraIds((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }
  function refreshAfterUnstash() {
    router.refresh();
  }

  // Phase Photo 6 (3단계) — "사건에 넣기" 대상 = 본인 life_event 만(연도순).
  const lifeEventOptions = useMemo<LifeEventOption[]>(
    () =>
      events
        .filter((e) => e.kind === "life_event")
        .map((e) => ({
          memoryId: e.id,
          title: e.title,
          year: e.eventYear,
          month: e.eventMonth,
        })),
    [events],
  );

  return (
    <LifeEventOptionsContext.Provider value={lifeEventOptions}>
    <div className="flex flex-col gap-6">
      <div className="hidden sm:block">
        <DesktopTimeline
          events={renderEvents}
          flags={flags}
          birthYear={birthYear}
          yearRange={yearRange}
          peopleByEvent={peopleState}
          onOpenPeople={openFor}
          onEraHide={hideEra}
          onEraUnhide={unhideEra}
          onEraRefresh={refreshAfterUnstash}
          photoUrls={photoUrls}
          onOpenPhoto={setOpenPhoto}
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
          onEraHide={hideEra}
          onEraUnhide={unhideEra}
          onEraRefresh={refreshAfterUnstash}
          photoUrls={photoUrls}
          onOpenPhoto={setOpenPhoto}
        />
      </div>

      {eventCount > 0 && eventCount < 5 && (
        <p className="text-center text-base text-ink-soft">
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

      {openPhoto && (
        <PhotoLightbox photo={openPhoto} onClose={() => setOpenPhoto(null)} />
      )}
    </div>
    </LifeEventOptionsContext.Provider>
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
  onEraHide,
  onEraUnhide,
  onEraRefresh,
  photoUrls,
  onOpenPhoto,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
  peopleByEvent: PeopleByEvent;
  onOpenPeople: (e: RenderEvent) => void;
  onEraHide: (id: string) => void;
  onEraUnhide: (id: string) => void;
  onEraRefresh: () => void;
  photoUrls: PhotoUrls;
  onOpenPhoto: (p: OpenPhoto) => void;
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
            onEraHide={onEraHide}
            onEraUnhide={onEraUnhide}
            onEraRefresh={onEraRefresh}
            photoUrls={photoUrls}
            onOpenPhoto={onOpenPhoto}
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
  onEraHide,
  onEraUnhide,
  onEraRefresh,
  photoUrls,
  onOpenPhoto,
}: {
  events: RenderEvent[];
  flags: PeriodFlag[];
  birthYear: number | null;
  yearRange: { min: number; max: number };
  peopleByEvent: PeopleByEvent;
  onOpenPeople: (e: RenderEvent) => void;
  onEraHide: (id: string) => void;
  onEraUnhide: (id: string) => void;
  onEraRefresh: () => void;
  photoUrls: PhotoUrls;
  onOpenPhoto: (p: OpenPhoto) => void;
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
            onEraHide={onEraHide}
            onEraUnhide={onEraUnhide}
            onEraRefresh={onEraRefresh}
            photoUrls={photoUrls}
            onOpenPhoto={onOpenPhoto}
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
  onEraHide,
  onEraUnhide,
  onEraRefresh,
  photoUrls,
  onOpenPhoto,
}: {
  e: RenderEvent;
  flag: PeriodFlag;
  birthYear: number | null;
  layout: "desktop" | "mobile";
  cardSide: "left" | "right";
  people: { id: string; name: string }[];
  onOpenPeople: (e: RenderEvent) => void;
  onEraHide: (id: string) => void;
  onEraUnhide: (id: string) => void;
  onEraRefresh: () => void;
  photoUrls: PhotoUrls;
  onOpenPhoto: (p: OpenPhoto) => void;
}) {
  const exact = e.precision === "EXACT";
  const isEra = e.kind === "era_event";
  const isPhoto = e.kind === "photo";
  const aria = isEra
    ? `${formatWhen(e)} ${formatTitle(e)} — 시대 배경`
    : isPhoto
      ? `${e.eventYear}년 사진`
      : `${formatWhen(e)} ${formatTitle(e)} — 이 이야기 편집하기`;

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
              {isEra ? (
                <EraCard
                  e={e}
                  align="right"
                  birthYear={birthYear}
                  onEraHide={onEraHide}
                  onEraUnhide={onEraUnhide}
                  onEraRefresh={onEraRefresh}
                />
              ) : isPhoto ? (
                <>
                  <PhotoCard
                    e={e}
                    align="right"
                    birthYear={birthYear}
                    photoUrls={photoUrls}
                    onOpenPhoto={onOpenPhoto}
                    onOpenPeople={() => onOpenPeople(e)}
                  />
                  <PeoplePreview
                    people={people}
                    align="right"
                    onClick={() => onOpenPeople(e)}
                  />
                </>
              ) : (
                <>
                  <EventCard
                    e={e}
                    align="right"
                    birthYear={birthYear}
                    onOpenPeople={() => onOpenPeople(e)}
                  />
                  {/* A — 기간 끝 점에선 인물·장소 숨김(시작 점에 1회). 인물·장소는
                      기간 전체 성격이라 사진처럼 anchor 안 씀. PhotoStrip 은 유지. */}
                  {!e.isPeriodEnd && (
                    <>
                      <PlacePreview place={e.place} align="right" />
                      <PeoplePreview
                        people={people}
                        align="right"
                        onClick={() => onOpenPeople(e)}
                      />
                    </>
                  )}
                  <PhotoStrip
                    e={e}
                    align="right"
                    photoUrls={photoUrls}
                    onOpenPhoto={onOpenPhoto}
                  />
                </>
              )}
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
            {isEra ? (
              <EraCard
                e={e}
                align="left"
                birthYear={birthYear}
                onEraHide={onEraHide}
                onEraUnhide={onEraUnhide}
                onEraRefresh={onEraRefresh}
              />
            ) : isPhoto ? (
              <>
                <PhotoCard
                  e={e}
                  align="left"
                  birthYear={birthYear}
                  photoUrls={photoUrls}
                  onOpenPhoto={onOpenPhoto}
                  onOpenPeople={() => onOpenPeople(e)}
                />
                <PeoplePreview
                  people={people}
                  align="left"
                  onClick={() => onOpenPeople(e)}
                />
              </>
            ) : (
              <>
                <EventCard
                  e={e}
                  align="left"
                  birthYear={birthYear}
                  onOpenPeople={() => onOpenPeople(e)}
                />
                {/* A — 기간 끝 점에선 인물·장소 숨김(시작 점에 1회). */}
                {!e.isPeriodEnd && (
                  <>
                    <PlacePreview place={e.place} align="left" />
                    <PeoplePreview
                      people={people}
                      align="left"
                      onClick={() => onOpenPeople(e)}
                    />
                  </>
                )}
                <PhotoStrip
                  e={e}
                  align="left"
                  photoUrls={photoUrls}
                  onOpenPhoto={onOpenPhoto}
                />
              </>
            )}
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
        {/* 점 — life_event 는 Link(편집 화면) / era_event 는 클릭 비활성 div */}
        {isEra ? (
          <div
            aria-label={aria}
            className="pointer-events-auto block rounded-full"
            title="시대 배경 — 카드 안에서 빼기 가능"
          >
            <span
              aria-hidden
              className={`block h-5 w-5 rounded-full border-2 border-ink-faint ${DECADE_DOT_CLASS[decadeTintKey(e.eventYear)]}`}
            />
          </div>
        ) : isPhoto ? (
          <div
            aria-label={aria}
            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink-faint bg-surface"
            title="사진"
          >
            <Camera strokeWidth={1.75} aria-hidden className="h-3.5 w-3.5 text-ink-faint" />
          </div>
        ) : (
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
                  ? "h-6 w-6 border-action bg-action"
                  : "h-4 w-4 border-amber-400 border-dashed bg-amber-100")
              }
            />
          </Link>
        )}

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

// 3차 — 연대(decade) 틴트. 시대(era) 카드 좌측 4px 스트립 + 시대 점에만
// 사용 (텍스트 배경 금지 — 토큰 가이드). Tailwind 정적 추출을 위해 리터럴
// 클래스 맵 (동적 클래스 조합 금지).
const DECADE_STRIP_CLASS: Record<number, string> = {
  1940: "border-l-decade-strip-1940",
  1950: "border-l-decade-strip-1950",
  1960: "border-l-decade-strip-1960",
  1970: "border-l-decade-strip-1970",
  1980: "border-l-decade-strip-1980",
  1990: "border-l-decade-strip-1990",
  2000: "border-l-decade-strip-2000",
  2010: "border-l-decade-strip-2010",
  2020: "border-l-decade-strip-2020",
};
const DECADE_DOT_CLASS: Record<number, string> = {
  1940: "bg-decade-1940",
  1950: "bg-decade-1950",
  1960: "bg-decade-1960",
  1970: "bg-decade-1970",
  1980: "bg-decade-1980",
  1990: "bg-decade-1990",
  2000: "bg-decade-2000",
  2010: "bg-decade-2010",
  2020: "bg-decade-2020",
};
// 토큰 범위(1940~2020) 밖 연도는 가장 가까운 연대로 clamp.
function decadeTintKey(year: number): number {
  const d = Math.floor(year / 10) * 10;
  return Math.min(2020, Math.max(1940, d));
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
          "block w-full rounded-md border-[1.5px] border-brand bg-surface px-4 py-3 pr-12 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2" +
          (align === "right" ? " pl-12 pr-4 text-right" : " text-left")
        }
      >
        <p
          className={
            "text-sm " +
            (exact ? "font-bold text-action" : "text-ink-faint")
          }
        >
          {formatWhen(e)}
          {ageSuffix && (
            <span className="ml-1 text-xs text-ink-faint">{ageSuffix}</span>
          )}
        </p>
        <p
          className={
            "mt-1 leading-tight " +
            (exact
              ? "text-base font-bold text-ink"
              : "text-base font-medium text-ink-soft")
          }
        >
          {displayTitle}
        </p>
        {/* 회상 미리보기 — content 있을 때만. 다듬기 적용분(displayRefined)은
            getLifeEvents 스왑으로 이미 e.content 에 반영됨. 기간 끝 점은 시작
            점과 같은 이야기라 중복 표시 안 함(인물·장소와 동일 정책). */}
        {!e.isPeriodEnd && e.content && (
          <p className="mt-1.5 line-clamp-2 text-lg leading-snug text-ink-soft">
            {e.content}
          </p>
        )}
      </Link>
      <button
        type="button"
        onClick={onOpenPeople}
        aria-label={`${displayTitle} — 함께한 인물 연결`}
        title="함께한 인물 연결"
        className={
          "absolute z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-line bg-surface shadow-sm hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 " +
          btnCorner
        }
      >
        <User strokeWidth={1.75} aria-hidden className="h-5 w-5 text-ink-soft" />
      </button>
    </div>
  );
}

// E2 — era_event 전용 카드. 클릭 동선 없음(div), 인물 모달 없음, 장소 없음.
// 시대 자료(description) + 출처 + 카테고리 뱃지 + 하단 "내 연혁에서 빼기".
// 색조(3차): surface + line 보더 + 좌측 4px 연대 틴트 스트립 — life_event
// 의 brand 보더와 즉시 구분 ("내 인생" vs "시대 배경").
function EraCard({
  e,
  align,
  birthYear,
  onEraHide,
  onEraUnhide,
  onEraRefresh,
}: {
  e: RenderEvent;
  align: "left" | "right";
  birthYear: number | null;
  onEraHide: (id: string) => void;
  onEraUnhide: (id: string) => void;
  onEraRefresh: () => void;
}) {
  const ageSuffix = formatAgeSuffix(e, birthYear);
  const displayTitle = formatTitle(e);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // E3 — content 옵티미스틱: server action 후 router.refresh() 가 prop 을
  // 갱신해도 인스턴스 유지 시 EraMemoryEditor 가 internal value 우선이라
  // 카드 표시(아래 "그때 저는")는 별도 state 로 즉시 반영.
  const [localContent, setLocalContent] = useState<string | null>(e.content);
  // 카드 시각 부담 최소화 — 평소엔 "그때 저는" 텍스트만, [수정] 또는 [회상
  // 적기] 누르면 EraMemoryEditor 펼침.
  const [isEditing, setIsEditing] = useState(false);

  function onRemove() {
    setError(null);
    onEraHide(e.originalId);
    startTransition(async () => {
      try {
        await unstashEraEventAction(e.originalId);
        onEraRefresh();
      } catch (err) {
        console.error("[era-unstash-timeline]", err);
        onEraUnhide(e.originalId);
        setError("잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="relative w-full max-w-[18rem]">
      <div
        className={
          "block w-full rounded-md border-t border-r border-b border-t-line border-r-line border-b-line border-l-4 bg-surface px-4 py-3 " +
          DECADE_STRIP_CLASS[decadeTintKey(e.eventYear)] +
          (align === "right" ? " text-right" : " text-left")
        }
      >
        {/* 상단 — "시대 배경" 뱃지 + 카테고리 뱃지 */}
        <div
          className={
            "flex flex-wrap items-center gap-1.5 " +
            (align === "right" ? "justify-end" : "justify-start")
          }
        >
          <span className="inline-flex items-center rounded-full border border-line bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
            시대 배경
          </span>
          {e.eraSection && (
            <span
              className={
                "inline-flex items-center rounded-full border-2 px-2 py-0.5 text-xs font-semibold " +
                SECTION_BADGE_CLASS[e.eraSection]
              }
            >
              {SECTION_LABEL[e.eraSection]}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm font-semibold text-ink-soft">
          {formatWhen(e)}
          {ageSuffix && (
            <span className="ml-1 text-xs text-ink-faint">{ageSuffix}</span>
          )}
        </p>
        <p className="mt-1 text-base font-bold leading-tight text-ink">
          {displayTitle}
        </p>
        {e.eraDescription && (
          <p className="mt-1 text-sm leading-snug text-ink-soft">
            {e.eraDescription}
          </p>
        )}
        {e.eraSource && (
          <p className="mt-1 text-xs text-ink-faint">출처: {e.eraSource}</p>
        )}

        {/* E3 — 본인 회상(content). 평소엔 "그때 저는" 한 줄 + [수정] 버튼,
            없으면 부드러운 [회상 적기] 진입. 누르면 EraMemoryEditor 펼침.
            카드가 작아 textarea 항상 노출 시 시각 부담 큼. */}
        {e.monthEventId && (
          <div className="mt-3">
            {isEditing ? (
              <EraMemoryEditor
                monthEventId={e.monthEventId}
                eventTitle={displayTitle}
                initialContent={localContent}
                onSaved={(newContent) => {
                  setLocalContent(newContent);
                  setIsEditing(false);
                  onEraRefresh();
                }}
                variant="compact"
              />
            ) : localContent ? (
              <div
                className={
                  "flex flex-col gap-2 " +
                  (align === "right" ? "items-end" : "items-start")
                }
              >
                <p
                  className={
                    "whitespace-pre-wrap text-sm leading-snug text-ink " +
                    (align === "right" ? "text-right" : "text-left")
                  }
                >
                  <span className="font-semibold text-emerald-700">
                    그때 저는 —{" "}
                  </span>
                  {localContent}
                </p>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex min-h-[32px] items-center rounded-md border border-emerald-300 bg-surface px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  회상 수정
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={buttonClasses(
                  "secondary",
                  "md",
                  align === "right" ? "self-end" : "self-start",
                )}
              >
                <Pencil strokeWidth={1.75} aria-hidden className="mr-1 h-5 w-5 text-action" />
                그때 어떻게 지내셨나요?
              </button>
            )}
          </div>
        )}

        {/* 빼기 버튼 — 카드 안 작게 */}
        <div
          className={
            "mt-3 flex " +
            (align === "right" ? "justify-end" : "justify-start")
          }
        >
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            aria-label={`${displayTitle} — 내 연혁에서 빼기`}
            className={buttonClasses("plain", "md")}
          >
            {isPending ? "빼는 중…" : "내 연혁에서 빼기"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-rose-700">
            {error}
          </p>
        )}
      </div>
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
    "mt-1 max-w-[18rem] text-xs leading-snug text-ink-soft hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
    (align === "right" ? "text-right" : "text-left");
  const content = (
    <>
      <MapPin strokeWidth={1.75} aria-hidden className="mr-0.5 inline-block h-3.5 w-3.5 text-ink-soft" />
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
        "mt-1 max-w-[18rem] rounded-md text-xs leading-snug text-ink-soft hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      <User strokeWidth={1.75} aria-hidden className="mr-0.5 inline-block h-3.5 w-3.5 text-ink-soft" />
      {compressNames(people)}
    </button>
  );
}

// Phase Photo (3단계) — 독립 사진 메모리(kind="photo") 전용 카드.
// 썸네일이 주인공. sky 톤으로 life_event(amber)·era_event(slate)와 즉시 구분.
// B — 👤 인물 연결(모달). C — 📍 장소(자체 관리 모달 + 칩). 사진 1장 = e.photos[0].
function PhotoCard({
  e,
  align,
  birthYear,
  photoUrls,
  onOpenPhoto,
  onOpenPeople,
}: {
  e: RenderEvent;
  align: "left" | "right";
  birthYear: number | null;
  photoUrls: PhotoUrls;
  onOpenPhoto: (p: OpenPhoto) => void;
  onOpenPeople: () => void;
}) {
  const router = useRouter();
  const photo = e.photos[0];
  const url = photo ? photoUrls[photo.id] : undefined;
  const when =
    e.eventMonth != null
      ? `${e.eventYear}년 ${e.eventMonth}월`
      : `${e.eventYear}년`;
  const ageSuffix = formatAgeSuffix(e, birthYear);
  const caption = e.content;
  // C — 장소는 e.place(이미 이벤트에 있음)라 스레딩 불필요, 카드가 자체 관리.
  // localPlace 옵티미스틱 — 저장 후 router.refresh() 가 prop 갱신 전까지 즉시 반영.
  const [placeOpen, setPlaceOpen] = useState(false);
  const [localPlace, setLocalPlace] = useState<PlaceInfo>(e.place);
  // 3단계 — "사건에 넣기" 모달. life_event 목록은 Context 로.
  const [attachOpen, setAttachOpen] = useState(false);
  const lifeEventOptions = useContext(LifeEventOptionsContext);

  return (
    <div
      className={
        "w-full max-w-[18rem] rounded-md border border-line bg-surface p-3 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {/* 뱃지 + 📍 장소 + 👤 인물 버튼 (B·C — EventCard 와 대칭) */}
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center rounded-full border border-ink-faint bg-surface px-2 py-0.5 text-xs font-semibold text-ink-faint">
          <Camera strokeWidth={1.75} aria-hidden className="mr-1 h-3.5 w-3.5" />사진
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPlaceOpen(true)}
            aria-label="이 사진의 장소 정하기"
            title="장소 정하기"
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-surface shadow-sm hover:border-brand hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            <MapPin strokeWidth={1.75} aria-hidden className="h-4 w-4 text-ink-soft" />
          </button>
          <button
            type="button"
            onClick={onOpenPeople}
            aria-label="이 사진에 함께한 인물 연결"
            title="함께한 인물 연결"
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-surface shadow-sm hover:border-brand hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            <User strokeWidth={1.75} aria-hidden className="h-4 w-4 text-ink-soft" />
          </button>
          {photo && lifeEventOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setAttachOpen(true)}
              aria-label="이 사진을 사건에 넣기"
              title="사건에 넣기"
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-surface shadow-sm hover:border-brand hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
            >
              <FolderOpen strokeWidth={1.75} aria-hidden className="h-4 w-4 text-ink-soft" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-action">
        {when}
        {ageSuffix && (
          <span className="ml-1 text-xs text-action">{ageSuffix}</span>
        )}
      </p>
      {url ? (
        <button
          type="button"
          onClick={() => onOpenPhoto({ url, caption, label: when })}
          aria-label={`${when} 사진 크게 보기`}
          className="mt-2 block w-full overflow-hidden rounded-md border-2 border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || `${when} 사진`}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
        </button>
      ) : (
        <p className="mt-2 rounded-md border-2 border-dashed border-brand bg-surface px-3 py-6 text-center text-xs text-action">
          사진을 불러오지 못했어요.
        </p>
      )}
      {caption && (
        <p className="mt-2 text-sm leading-snug text-ink-soft">{caption}</p>
      )}

      {/* C — 장소 칩(있으면 외부 지도 링크). 옵티미스틱 localPlace 사용. */}
      <PlacePreview place={localPlace} align={align} />

      {placeOpen && (
        <PhotoPlaceModal
          memoryId={e.originalId}
          initialPlace={localPlace}
          onClose={() => setPlaceOpen(false)}
          onSaved={(p) => {
            setLocalPlace(p);
            setPlaceOpen(false);
            router.refresh();
          }}
        />
      )}

      {attachOpen && photo && (
        <AttachToEventModal
          photoId={photo.id}
          photoYear={e.eventYear}
          options={lifeEventOptions}
          onClose={() => setAttachOpen(false)}
          onMoved={() => {
            setAttachOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// Phase Photo 6 (3단계) — 독립 사진을 사건에 넣는 모달. 본인 life_event 목록을
// 연도순으로 보여주고, 사진 연도에 가까운 것을 위에 강조. 탭하면 이동.
function AttachToEventModal({
  photoId,
  photoYear,
  options,
  onClose,
  onMoved,
}: {
  photoId: string;
  photoYear: number;
  options: LifeEventOption[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // 연도순(ASC) + 사진 연도와의 거리로 보조 정렬 — 가까운 사건이 위로.
  const sorted = useMemo(
    () =>
      [...options].sort((a, b) => {
        const da = Math.abs(a.year - photoYear);
        const db = Math.abs(b.year - photoYear);
        if (da !== db) return da - db;
        return a.year - b.year;
      }),
    [options, photoYear],
  );

  function pick(memoryId: string) {
    setError(null);
    setBusyId(memoryId);
    startTransition(async () => {
      const res = await movePhotoToEventAction(photoId, memoryId);
      if (res.ok) {
        onMoved();
      } else {
        setError(res.error);
        setBusyId(null);
      }
    });
  }

  function onBackdropClick(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.target === ev.currentTarget) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사건에 넣기"
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-md bg-surface p-5 sm:p-6">
        <div>
          <h2 className="flex items-center gap-1.5 text-xl font-bold text-ink">
            <FolderOpen strokeWidth={1.75} aria-hidden className="h-5 w-5 shrink-0 text-ink" />
            어느 사건에 넣을까요?
          </h2>
          <p className="mt-1 text-base text-ink-soft">
            고른 사건에 이 사진이 함께 담겨요. 사진은 사라지지 않아요.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {sorted.map((o) => {
            const when = o.month != null ? `${o.year}년 ${o.month}월` : `${o.year}년`;
            return (
              <li key={o.memoryId}>
                <button
                  type="button"
                  onClick={() => pick(o.memoryId)}
                  disabled={isPending}
                  className="flex w-full min-h-[52px] items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-4 py-2 text-left hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-ink">
                      {o.title}
                    </span>
                    <span className="block text-sm text-ink-faint">{when}</span>
                  </span>
                  {busyId === o.memoryId && (
                    <span className="text-sm text-amber-700">넣는 중…</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t-2 border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-sm font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:opacity-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// C — 독립 사진의 장소 편집 모달. PlaceSearchInput 재사용 + updatePhotoPlaceAction.
// 지도가 길 수 있어 위쪽 정렬 + 스크롤. 저장 성공 시 onSaved(place)로 부모가
// 옵티미스틱 반영 + router.refresh().
function PhotoPlaceModal({
  memoryId,
  initialPlace,
  onClose,
  onSaved,
}: {
  memoryId: string;
  initialPlace: PlaceInfo;
  onClose: () => void;
  onSaved: (place: PlaceInfo) => void;
}) {
  const [place, setPlace] = useState<PlaceInfo>(initialPlace);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePhotoPlaceAction(memoryId, place);
      if (res.ok) {
        onSaved(place);
      } else {
        setError(res.error);
      }
    });
  }

  function onBackdropClick(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.target === ev.currentTarget) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 장소"
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-10"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-md bg-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-ink">
          <MapPin strokeWidth={1.75} aria-hidden className="h-5 w-5 shrink-0 text-ink" />
          이 사진은 어디서 찍었나요?
        </h2>
        <PlaceSearchInput value={place} onChange={setPlace} />
        {error && (
          <p
            role="alert"
            className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t-2 border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-sm font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-action px-5 py-2 text-sm font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line"
          >
            {isPending ? "저장 중…" : "장소 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Phase Photo (3단계) — life_event 카드 아래 첨부 사진 썸네일 strip.
// 최대 3장 + "외 N장". 각 썸네일 클릭 → 라이트박스. 사진 0장이면 렌더 X
// (사진 없는 기존 연혁 그대로). 카드 Link 와 충돌 없게 형제로 둠.
const STRIP_LIMIT = 3;

function PhotoStrip({
  e,
  align,
  photoUrls,
  onOpenPhoto,
}: {
  e: RenderEvent;
  align: "left" | "right";
  photoUrls: PhotoUrls;
  onOpenPhoto: (p: OpenPhoto) => void;
}) {
  if (e.photos.length === 0) return null;
  // Phase Photo (4단계+) — 기간 이벤트의 어느 점인지에 따라 앵커 필터.
  //   끝 점(isPeriodEnd)  : end / both
  //   시작 점(isPeriodStart): start / both
  //   단일 점(둘 다 아님)  : 전부 (앵커 무관)
  const visiblePhotos = e.photos.filter((p) => {
    if (e.isPeriodEnd) {
      return p.periodAnchor === "end" || p.periodAnchor === "both";
    }
    if (e.isPeriodStart) {
      return p.periodAnchor === "start" || p.periodAnchor === "both";
    }
    return true;
  });
  if (visiblePhotos.length === 0) return null;
  const label = `${formatWhen(e)} ${formatTitle(e)}`;
  const shown = visiblePhotos.slice(0, STRIP_LIMIT);
  const extra = visiblePhotos.length - shown.length;
  return (
    <div
      className={
        "mt-1 flex max-w-[18rem] flex-wrap gap-1.5 " +
        (align === "right" ? "justify-end" : "justify-start")
      }
    >
      {shown.map((p) => {
        const url = photoUrls[p.id];
        if (!url) return null;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpenPhoto({ url, caption: p.caption, label })}
            aria-label={`${label} 사진 크게 보기`}
            className="block h-16 w-16 overflow-hidden rounded-md border-2 border-amber-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={p.caption || `${label} 사진`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        );
      })}
      {extra > 0 && (
        <span className="flex h-16 w-16 items-center justify-center rounded-md border-2 border-amber-200 bg-amber-50 text-sm font-semibold text-amber-800">
          외 {extra}장
        </span>
      )}
    </div>
  );
}

// Phase Photo (3단계) — 라이트박스(보기 전용). 삭제는 /photos·편집 화면에서만.
// 배경 클릭·Esc 로 닫기. 타임라인은 "둘러보기" 에 집중.
function PhotoLightbox({
  photo,
  onClose,
}: {
  photo: OpenPhoto;
  onClose: () => void;
}) {
  function onBackdropClick(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.target === ev.currentTarget) onClose();
  }
  function onKey(ev: React.KeyboardEvent) {
    if (ev.key === "Escape") onClose();
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.label} 사진`}
      onClick={onBackdropClick}
      onKeyDown={onKey}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="flex max-h-full max-w-3xl flex-col gap-3 rounded-md bg-surface p-4 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || `${photo.label} 사진`}
          className="max-h-[70vh] w-auto self-center rounded-md"
        />
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-ink">{photo.label}</p>
          {photo.caption && (
            <p className="text-sm text-ink-soft">{photo.caption}</p>
          )}
        </div>
        <div className="flex justify-end border-t-2 border-line pt-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-sm font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border-2 border-line bg-surface px-4 py-3 text-base text-ink-soft">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-5 w-5 rounded-full border-2 border-action bg-action"
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
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-5 w-5 rounded-full border-2 border-ink-faint bg-decade-1980"
        />
        시대 배경
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink-faint bg-surface"
        >
          <Camera strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-faint" />
        </span>
        사진
      </span>
      <span className="text-ink-faint">
        점은 그 시기로, 빈 자리는 새 이야기로
      </span>
    </div>
  );
}
