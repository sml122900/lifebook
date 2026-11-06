"use client";

// My Life 마인드맵 — docs/phase/my-life-restructure.md(개편 1단계 지도) · node-graph-self.md §6 2b.1·2b-3a 수정.
//
// 지도 = 자유 이동 캔버스(react-zoom-pan-pinch). 끌기 = 이동, 두 손가락·휠·빈 곳 더블탭 = 그 지점 확대,
//   [+][−] = 화면 가운데 기준, [전체 보기] = 지도 전체, 키보드 화살표 = 이동. 노드 크기·간격은 지도 좌표로 고정
//   (lib/my-life-layout). 지도 화면에서는 페이지 스크롤을 잠근다.
// 개편 1단계: 시간 줄기 오른쪽에 인물록(모임 영역·교집합 칸·무소속)·장소록. 노드를 누르면 선택 + 패널 —
//   선택한 노드의 간선(이야기 → 인물·장소, 중심 직접 연결)만 보이고 [인물 간선 끄기][장소 간선 끄기]로 종류별로 끈다.
//   화면 밖 영역·연결 대상은 가장자리 버튼. 전체 보기 상태(배율 < 0.6)에서 노드를 누르면 패널 대신 그 노드로 확대.
//   [찾기] = 브라우저 안 글자 검색(lib/my-life-search) — 결과를 누르면 접힌 띠를 펼치고 이동·선택.
// 지도 DOM 은 시기 순 목록 → 인물록 → 장소록 순서(스크린리더·Tab). 모임 영역·간선은 aria-hidden.
// 개편 3단계: 머리 줄 [+ 만들기](7종) · 인물록·장소록 제목 옆 [+ 사람][+ 모임]/[+ 장소][+ 묶음] · 장소 묶음 영역(장소록) ·
//   패널의 넣기·빼기·되돌리기·옮기기·지우기(./EditUI). 만든 뒤 지도가 새 노드로 이동·선택·패널 + [되돌리기].
// 우주 개편 U1(2026-11-05 — docs/phase/ui-space.md): 시기·이야기 = 행성(원), 사람·모임·장소 = 위성(행성 아래 정지 칸 — 바로가기),
//   인물록·장소록 = 작은 행성 모음. 간선은 그리지 않고(Q114) 선택한 사람·장소의 위성·진짜 자리에 빛 고리. "지금 보는 곳" 줄·
//   [이야기 거리] 줄은 뺐다(§6.2 — [이야기 거리]는 만들기 시트 맨 아래·목록 보기).
// 우주 개편 U2(2026-11-05 — ui-space §7.2): 위성이 행성 둘레를 돈다(CSS 키프레임 — lib/space-orbit, 붙이기 ./orbit). 화면 안 계만 ·
//   전체 보기 배율·[움직임 멈추기]·reduced-motion = 그 자리 멈춤 · 행성 탭 = 그 계만 멈추고 칸 줄로 펼침 + 패널, 다시 탭·다른 곳 = 재개.
// 밤 우주(2026-11-05 단일 테마 결정 — docs/phase/ui-night.md): 테마는 앱 전체 <html data-theme>(허용 목록 — lib/night-theme)를
//   따른다. U1 의 지도 안 토글·기기 저장값은 삭제(Q149). 밝은 우주 지도 값(.space-map)은 globals.css 에 남아 허용 목록 밖에서 쓰인다.
// Q69(/story-review 합치기, 2026-11-02): 목록 보기 = 오늘의 인터뷰(맨 위)·더 들어볼까요?(시간 줄기 아래) — 그때의 나는
//   시기 아래 꼬리표로만(별도 묶음은 중복이라 뺌, Q69 후속),
//   지도 보기 = "지금 보는 곳" 줄 [이야기 거리] → 같은 카드 시트(./Suggestions). 이야기 패널 [이야기 고치기](본문).

import { MapPin, MessageCircle, Minus, Pause, Play, Plus, Search, UserRound, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { updateEpisodeContentAction } from "@/app/actions/episode";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import type { MyLifeChip, MyLifeData, MyLifeEvent, MyLifeGroup, MyLifePerson, MyLifePlace, MyLifeStory } from "@/lib/my-life";
import { customOf } from "@/lib/my-life-custom";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import { selectionEdges, type EdgeToggles } from "@/lib/my-life-edges";
import { shapeRadiusCss } from "@/lib/my-life-group-shape";
import {
  FOLD_ALL_ABOVE,
  eventPeoplePlaces,
  L,
  bandAt,
  countTimelineNodes,
  layoutMyLife,
  storyTag,
  yearText,
  type LayoutNode,
  type LayoutSatellite,
  type MyLifeLayout,
} from "@/lib/my-life-layout";
import { searchMyLife, type SearchResult } from "@/lib/my-life-search";
import { labelName, labelVisible, orbitCss, orbitName, orbitPoint, orbitShape } from "@/lib/space-orbit";
import type { DropPlanet } from "@/lib/space-drag";
import type { CreatedLink } from "@/lib/my-life-edit";
import { applyOptDecor, applyOptLinks, putOptDecor, putOptLink, settleOptDecor, settleOptLinks, type OptDecor, type OptLink } from "@/lib/my-life-optimistic";
import type { NodeRef } from "@/lib/node-graph";
import { displayTitle, hasOwnTitle, shortTitle } from "@/lib/story-title";

import { ConflictReload } from "./_body/ConflictReload";
import { addLinkAction, setDecorationAction, undoCreateAction, undoLinksAction, undoMoveAction } from "./actions";
import { AskSheet } from "./AskSheet";
import { builtinName, CategoryListSections, CategoryRegions, CategorySheet, customName, customPanelInfo } from "./Custom";
import { DecorArt } from "./Decor";
import { beginPress, dragJustEnded, lockPanZoom, type DropResult, type OptLinks } from "./drag";
import { CreateSheet, NodeEditor, type CreateKind, type Created, type CreatePreset, type Notice } from "./EditUI";
import { animateClose, animateOpen, observeOrbits, readMotion, resyncOrbits, snapshotSats, subscribeMotion, writeMotion } from "./orbit";
import { GapCards, InterviewEntryCard, type MyLifeSuggest } from "./Suggestions";

const MAX_SCALE = 3;
const MIN_SCALE = 0.5; // 지도 전체가 이보다 작아야 들어가면 그 배율까지 내려간다
const ZOOM_STEP = 0.25;
const TAP_SLOP = 8; // 이만큼(px) 넘게 움직이면 탭이 아니라 끌기
const KEEP_VISIBLE = 120; // 움직임이 멈췄을 때 지도가 화면에 최소 이만큼(px) 남게 — 지도를 잃지 않게
const DOUBLE_TAP_MS = 350; // 어르신 손 — 라이브러리 기본(200ms)보다 넉넉하게
const DOUBLE_TAP_SCALE = 1.6;
const OVERVIEW_SCALE = 0.6; // 이 배율 미만 = 전체 보기 상태(노드 탭 = 그 노드로 확대 — Q60)
const STORE_KEY = "mylife:v3";
const ALL_EDGES: EdgeToggles = { person: true, place: true }; // U1 — 간선 끄기 토글 없앰(Q114), 연결 계산은 늘 전부
// 공전 키프레임 + 표식 규칙(U2 — 행성 크기 4종 × 궤도 2) — 지도에 한 번 넣는다(lib/space-orbit).
const ORBIT_CSS = orbitCss([L.PLANET_STORY, ...L.PLANET_PERIOD]);
const PLANET_KINDS = new Set(["event", "story"]);

type Saved = { scale: number; x: number; y: number; folded: string[]; shownGroups: string[]; shownPlaceGroups?: string[]; openCats?: string[]; edges: EdgeToggles };

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
    if (
      v &&
      [v.scale, v.x, v.y].every((n) => typeof n === "number" && Number.isFinite(n)) &&
      Array.isArray(v.folded) &&
      Array.isArray(v.shownGroups) &&
      typeof v.edges?.person === "boolean" &&
      typeof v.edges?.place === "boolean"
    )
      return v;
  } catch {
    // 저장소 불가·형식 오류 — 저장값 없이 시작
  }
  return null;
}

function writeSaved(v: Saved) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    // 저장소 불가 환경 — 기억하지 않을 뿐
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function eventAriaLabel(ev: MyLifeEvent): string {
  const y = ev.year === null ? C.yearUnknown : `${yearText(ev)}년`;
  const n = eventPeoplePlaces(ev);
  return C.eventName(y, ev.label, ev.stories.length, n.people + n.places);
}

function storyAriaLabel(s: MyLifeStory): string {
  const names = s.chips.map((c) => c.name);
  return s.kind === "SELF" ? C.selfName(displayTitle(s), names) : C.storyName(displayTitle(s), names, tagText(s));
}

// 외부 지도 — 기존 연혁 카드(TimelineView externalMapHref)와 같은 규칙.
function placeMapHref(p: { name: string; source: string | null; lat: number | null; lng: number | null }): string {
  const q = encodeURIComponent(p.name);
  if (p.source === "naver") return `https://map.naver.com/p/search/${q}`;
  if (p.source === "google" && p.lat !== null && p.lng !== null) return `https://maps.google.com/?q=${p.lat},${p.lng}`;
  return `https://maps.google.com/?q=${q}`;
}

const FOCUS = "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2";
const CHIP_KIND: Record<MyLifeChip["kind"], string> = {
  person: "border-person bg-person-wash",
  group: "border-person bg-person-wash",
  place: "border-place bg-place-wash",
};
// 찾기·선택 빛 — 색만으로 알리지 않게 굵은 고리 + 점선 바깥 고리(1.4.1, ui-space §1.5).
const GLOW: React.CSSProperties = { boxShadow: "0 0 0 4px var(--color-glow), 0 0 18px 6px var(--color-glow)", outline: "2px dashed var(--color-glow)", outlineOffset: 8 };
// 선택 = 진한 윤곽, 연결된 노드 = 다른 색·두께의 윤곽(키보드 포커스 링 brand 4px 와 구분). 흐리게 하지 않는다.
const SELECTED_OUTLINE: React.CSSProperties = { outline: "4px solid var(--color-ink)", outlineOffset: 2 };
const RELATED_OUTLINE: React.CSSProperties = { outline: "3px solid var(--color-action)", outlineOffset: 3 };
const GROUP_BORDER = ["solid", "dashed", "dotted"] as const; // 모임 영역 테두리 무늬(색만으로 구분 안 함)

// 지도·목록·패널이 같이 쓰는 조회표.
type Index = {
  eventById: Map<string, MyLifeEvent>;
  personById: Map<string, MyLifePerson>;
  placeById: Map<string, MyLifePlace>;
  groupById: Map<string, MyLifeGroup>;
  placeGroupById: Map<string, MyLifeGroup>;
  storiesOfPerson: Map<string, { eventId: string; story: MyLifeStory }[]>;
  storiesOfPlace: Map<string, { eventId: string; story: MyLifeStory }[]>;
};

function buildIndex(data: MyLifeData): Index {
  const storiesOfPerson = new Map<string, { eventId: string; story: MyLifeStory }[]>();
  const storiesOfPlace = new Map<string, { eventId: string; story: MyLifeStory }[]>();
  for (const ev of data.events) {
    for (const s of ev.stories) {
      if (s.primaryEventId !== ev.id) continue; // 걸친 이야기는 주 소속 쪽 한 번만
      for (const c of s.chips) {
        const m = c.kind === "person" ? storiesOfPerson : c.kind === "place" ? storiesOfPlace : null;
        if (!m) continue;
        if (!m.has(c.id)) m.set(c.id, []);
        m.get(c.id)!.push({ eventId: ev.id, story: s });
      }
    }
  }
  return {
    eventById: new Map(data.events.map((e) => [e.id, e])),
    personById: new Map(data.people.map((p) => [p.id, p])),
    placeById: new Map(data.places.map((p) => [p.id, p])),
    groupById: new Map(data.groups.map((g) => [g.id, g])),
    placeGroupById: new Map(data.placeGroups.map((g) => [g.id, g])),
    storiesOfPerson,
    storiesOfPlace,
  };
}

function nodeName(key: string, data: MyLifeData, idx: Index): string {
  const [kind, a, b] = key.split(":");
  if (kind === "ev") return idx.eventById.get(a)?.label ?? "";
  if (kind === "st") {
    const s = idx.eventById.get(a)?.stories.find((x) => x.id === b);
    return s ? displayTitle(s) : "";
  }
  if (kind === "pe") return idx.personById.get(a)?.name ?? "";
  if (kind === "pl") return idx.placeById.get(a)?.name ?? "";
  if (kind === "gl" || kind === "gc") return idx.groupById.get(a)?.name ?? "";
  if (kind === "pgl" || kind === "pgc") return idx.placeGroupById.get(a)?.name ?? "";
  return customName(key, data) ?? ""; // 사용자 카테고리·묶음·항목·기본 카테고리(custom-graph 2단계)
}

// ── 화면 ────────────────────────────────────────────────────────────

export function MyLifeView({ data: serverData, suggest }: { data: MyLifeData; suggest: MyLifeSuggest }) {
  const router = useRouter();
  // 낙관적 연결(U3 후속 — lib/my-life-optimistic): 끌어 넣은 위성은 저장 응답 전에 보이고, [되돌리기]는 응답 전에 숨긴다.
  // 화면이 그리는 data = 서버 데이터 + 아직 남은 항목. 저장이 끝나고 서버 데이터에 보이는 항목은 여기서 바로 지운다.
  const [optLinks, setOptLinks] = useState<readonly OptLink[]>([]);
  const liveOpt = settleOptLinks(serverData, optLinks);
  if (liveOpt !== optLinks) setOptLinks(liveOpt);
  // 행성 꾸미기(U4) — 같은 규칙(노드 하나 = 항목 하나 · 저장 끝 + 서버 데이터에 보이면 정리 · 실패면 지움)
  const [optDecor, setOptDecor] = useState<readonly OptDecor[]>([]);
  const liveDecor = settleOptDecor(serverData, optDecor);
  if (liveDecor !== optDecor) setOptDecor(liveDecor);
  const data = useMemo(() => applyOptDecor(applyOptLinks(serverData, liveOpt), liveDecor), [serverData, liveOpt, liveDecor]);
  const optSeqRef = useRef(0);
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "map";
  // ?focus=<노드 키> — /chat-v3 에서 방금 만든 이야기로 바로 가기(My Life 개편 2단계). 처음 그릴 때 한 번 —
  // 그 띠는 펼치고, 선택 + 지도 이동(MapMode 의 focusRequest 이펙트가 준비된 뒤 옮긴다).
  const [initialFocus] = useState(() => {
    const key = searchParams.get("focus");
    if (!key || !/^(ev|st|pe|pl|gl|pgl|cat|cgl|cn):/.test(key)) return null;
    const eventId = key.startsWith("st:") || key.startsWith("ev:") ? key.split(":")[1] : null;
    if (eventId && !data.events.some((e) => e.id === eventId)) return null;
    return { key, eventId };
  });
  // 인물록 통합(2026-11-06) — ?area=people|places = 처음 그릴 때 그 영역으로(사이드 패널 인물록·옛 /people — lib/people-entry) ·
  // ?focus=pe:<id>&edit=1 = 그 사람 패널을 [이름·정보 고치기]로 열고 시작(옛 /people/[id]/edit). 없는 사람이면 패널 안 엶.
  const [initialArea] = useState<"people" | "places" | null>(() => {
    const a = searchParams.get("area");
    return a === "people" || a === "places" ? a : null;
  });
  const [editKey, setEditKey] = useState<string | null>(() =>
    searchParams.get("edit") === "1" && initialFocus?.key.startsWith("pe:") && data.people.some((p) => `pe:${p.id}` === initialFocus.key) ? initialFocus.key : null,
  );
  // 접기 기본값(Q41) — 시간 줄기 노드가 많으면 전부 접힘. 같은 탭의 저장값은 지도가 열릴 때 덮는다.
  const [folded, setFolded] = useState<Set<string>>(
    () =>
      new Set(
        countTimelineNodes(data) > FOLD_ALL_ABOVE
          ? data.events.filter((e) => e.stories.length > 0 && e.id !== initialFocus?.eventId).map((e) => e.id)
          : [],
      ),
  );
  const [shownGroups, setShownGroups] = useState<string[]>([]);
  const [shownPlaceGroups, setShownPlaceGroups] = useState<string[]>([]);
  // 사용자 카테고리(custom-graph 2단계): 펼친 카테고리(6개 이상일 때 — 같은 탭 기억) · [N개 더 보기]를 연 카테고리 · 칩으로 고른 묶음.
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [moreCats, setMoreCats] = useState<Set<string>>(new Set());
  const [shownCustomGroups, setShownCustomGroups] = useState<string[]>([]);
  const [panelFromCat, setPanelFromCat] = useState<string | null>(null); // 바로가기로 연 원래 노드 패널 — 그 카테고리
  const [pickKey, setPickKey] = useState<string | null>(null); // 카테고리 영역 [+ 넣기] — 그 카테고리 패널을 넣기 고르기로
  const [createPreset, setCreatePreset] = useState<CreatePreset | undefined>(undefined);
  // 3단계 — 패널 맨 위 알림(넣었어요·만들었어요 + [되돌리기], 다음 동작 전까지) · 만들기 시트 · 만든 뒤 갈 노드.
  const [notice, setNotice] = useState<Notice | null>(null);
  // 지운 뒤 알림("○○을 지웠어요") — 패널이 닫혀서 지도 머리 줄·목록 위에. 다음 동작(패널·찾기·만들기·보기 바꾸기) 전까지.
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  // 연결된 곳 차례 보기 — 패널의 [연결된 곳 차례로 보기(N)]가 시작(패널 닫고 첫 연결로, 2026-11-02 머리 줄에서 옮김),
  // 진행 중엔 선택 줄 [다음 연결](3단계 최종 E2E 2026-11-02). at = 지금 보는 연결 순번(1~N, 0 = 고른 노드로 돌아가 끝) · n = 요청 번호.
  const [tour, setTour] = useState<Tour | null>(null);
  const focusTourRef = useRef(false); // 차례 보기를 시작하며 패널을 닫을 때 — 포커스를 노드 대신 [다음 연결]로
  const [createKind, setCreateKind] = useState<CreateKind | null | undefined>(undefined); // undefined = 닫힘, null = 종류 고르기부터
  // keep — 패널 안 작업(옮기기·직접 쓰기)으로 생긴 노드: 지도 위치·배율은 그대로, 보이는 곳 밖일 때만 옮김(3단계 E2E 2026-11-02).
  const [pendingOpen, setPendingOpen] = useState<(Created & { keep?: boolean }) | null>(null);
  const createRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(initialFocus?.key ?? null);
  const [panel, setPanel] = useState<string | null>(editKey);
  if (editKey && panel !== editKey) setEditKey(null); // 고치기로 연 패널을 닫거나 다른 노드로 옮기면 끝(다시 열면 보통 패널)
  if (pickKey && panel !== pickKey) setPickKey(null);
  const [panelFromSat, setPanelFromSat] = useState(false); // 위성(바로가기)에서 연 사람·장소·모임 패널 — [원래 자리로 가기](U2 §2.3)
  const [findOpen, setFindOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askSeed, setAskSeed] = useState<string | null>(null); // 한 번 연 뒤로 시트 내용을 남김(칩으로 지도에 갔다 다시 열어도 답이 보임)
  const [suggestOpen, setSuggestOpen] = useState(false); // 지도 보기 [이야기 거리] 시트(Q69)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(
    initialFocus ? { key: initialFocus.key, n: 1 } : null,
  );
  const lastKeyRef = useRef<string | null>(editKey);
  const openedAtRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const findRef = useRef<HTMLDialogElement>(null);
  const askRef = useRef<HTMLDialogElement>(null);
  const suggestRef = useRef<HTMLDialogElement>(null);

  const layout = useMemo(
    () => layoutMyLife(data, { folded, shownGroupIds: shownGroups, shownPlaceGroupIds: shownPlaceGroups, openCats, moreCats, shownCustomGroupIds: shownCustomGroups }),
    [data, folded, shownGroups, shownPlaceGroups, openCats, moreCats, shownCustomGroups],
  );
  const idx = useMemo(() => buildIndex(data), [data]);
  const relatedCount = useMemo(
    () => (view === "map" && selected ? selectionEdges(data, layout, selected, ALL_EDGES).connected.length : 0),
    [view, selected, data, layout],
  );

  const openPanel = useCallback((key: string, fromSat = false, fromCat: string | null = null) => {
    setMapNotice(null);
    lastKeyRef.current = key;
    setSelected(key);
    setPanel(key);
    setPanelFromSat(fromSat);
    setPanelFromCat(fromCat);
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (panel && !d.open) {
      openedAtRef.current = Date.now();
      d.showModal();
      // ?edit=1 로 [이름·정보 고치기]부터 연 패널 — 첫 입력칸 대신 제목에 포커스(키보드가 바로 안 뜨게 · 패널 안 단계 바뀜과 같은 규칙)
      const h = d.querySelector("#mylife-info-name") ? d.querySelector<HTMLElement>("#mylife-panel-title") : null;
      if (h) {
        h.tabIndex = -1;
        h.focus({ preventScroll: true });
      }
    }
    if (!panel && d.open) d.close();
  }, [panel]);

  useEffect(() => {
    const d = findRef.current;
    if (!d) return;
    if (findOpen && !d.open) d.showModal();
    if (!findOpen && d.open) d.close();
  }, [findOpen]);

  useEffect(() => {
    const d = askRef.current;
    if (!d) return;
    if (askOpen && !d.open) d.showModal();
    if (!askOpen && d.open) d.close();
  }, [askOpen]);

  useEffect(() => {
    const d = suggestRef.current;
    if (!d) return;
    if (suggestOpen && !d.open) d.showModal();
    if (!suggestOpen && d.open) d.close();
  }, [suggestOpen]);

  useEffect(() => {
    const d = createRef.current;
    if (!d) return;
    if (createKind !== undefined && !d.open) d.showModal();
    if (createKind === undefined && d.open) d.close();
  }, [createKind]);

  function onDialogClose() {
    setPanel(null);
    if (focusTourRef.current) {
      focusTourRef.current = false;
      document.querySelector<HTMLElement>("[data-tour-next]")?.focus({ preventScroll: true });
      return;
    }
    const key = lastKeyRef.current;
    if (key) document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  function toggleView() {
    setPanel(null);
    setMapNotice(null);
    window.history.pushState(null, "", view === "map" ? "?view=list" : window.location.pathname);
  }

  const toggleFold = useCallback((eventId: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  // 노드로 가기(검색 결과·패널의 "여기로 가기") — 접힌 띠면 펼치고, 지도는 이동·확대 + 선택, 목록은 스크롤.
  // keep = 확대·가운데 맞춤 없이, 그 노드가 보이는 곳 밖일 때만 옮김(패널 안 작업으로 생긴 노드).
  const goTo = useCallback(
    (key: string, eventId: string | null, keep = false) => {
      setPanel(null);
      setMapNotice(null);
      setFindOpen(false);
      if (view === "list") {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(`[data-list-key="${CSS.escape(key)}"]`);
          el?.scrollIntoView({ block: "center" });
          el?.focus({ preventScroll: true });
        });
        return;
      }
      if (eventId && key.startsWith("st:")) {
        setFolded((prev) => {
          if (!prev.has(eventId)) return prev;
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      }
      // 사용자 카테고리 노드 — 접힌 카테고리면 펼치고 [N개 더 보기]도 연다(custom-graph 2단계)
      const [ck, cid] = key.split(":");
      const cat =
        ck === "cat" ? cid : ck === "cn" ? customOf(data).items.find((i) => i.id === cid)?.categoryId : ck === "cgl" ? customOf(data).groups.find((g) => g.id === cid)?.categoryId : undefined;
      if (cat) {
        setOpenCats((prev) => (prev.has(cat) ? prev : new Set([...prev, cat])));
        if (ck !== "cat") setMoreCats((prev) => (prev.has(cat) ? prev : new Set([...prev, cat])));
      }
      // 모임·장소 묶음 이름이 영역에 없으면(4개 이상 — 숨은 모임) 칩으로
      const target =
        key.startsWith("gl:") && !layout.nodes.some((n) => n.key === key)
          ? `gc:${key.slice(3)}`
          : key.startsWith("pgl:") && !layout.nodes.some((n) => n.key === key)
          ? `pgc:${key.slice(4)}`
          : key.startsWith("cgl:") && !layout.nodes.some((n) => n.key === key) && layout.nodes.some((n) => n.key === `cgc:${key.slice(4)}`)
          ? `cgc:${key.slice(4)}`
          : key;
      setSelected(target);
      setFocusRequest((r) => ({ key: target, n: (r?.n ?? 0) + 1, keep }));
    },
    [view, layout, data],
  );

  // 만든 뒤·옮긴 뒤 — 새 데이터(router.refresh)에 그 노드가 생기면 이동·선택·패널 + 알림.
  useEffect(() => {
    if (!pendingOpen) return;
    const [k, x, y] = pendingOpen.key.split(":");
    const has =
      k === "ev" ? data.events.some((e) => e.id === x)
      : k === "st" ? data.events.some((e) => e.id === x && e.stories.some((s) => s.id === y))
      : k === "pe" ? data.people.some((p) => p.id === x)
      : k === "pl" ? data.places.some((p) => p.id === x)
      : k === "gl" ? data.groups.some((g) => g.id === x)
      : k === "pgl" ? data.placeGroups.some((g) => g.id === x)
      : k === "cat" ? customOf(data).categories.some((c) => c.id === x)
      : k === "cgl" ? customOf(data).groups.some((g) => g.id === x)
      : k === "cn" ? customOf(data).items.some((i) => i.id === x)
      : false;
    if (!has) return;
    const done = pendingOpen;
    // 다음 그림에서 — 새 노드가 지도에 그려진 뒤 옮긴다(효과 안에서 바로 상태를 바꾸지 않음).
    const raf = requestAnimationFrame(() => {
      setPendingOpen(null);
      goTo(done.key, done.eventId, done.keep);
      const key = done.key.startsWith("pgl:") && !layout.nodes.some((n) => n.key === done.key) && view === "map" ? `pgc:${done.key.slice(4)}` : done.key;
      openPanel(key);
      const u = done.undo;
      const mv = done.undoMove;
      setNotice({
        key,
        text: done.text,
        undo: u
          ? async () => {
              const r = await undoCreateAction(u);
              router.refresh();
              return r;
            }
          : mv
          ? async () => {
              // 옮기기 되돌리기 — 원래 시기로 돌아간 그 이야기 패널을 다시 연다(3단계 E2E 2026-11-02).
              const r = await undoMoveAction(mv);
              if (r.ok) setPendingOpen({ key: r.key, eventId: mv.fromEventId, text: C.edit.undone, undo: null, keep: true });
              router.refresh();
              return r;
            }
          : undefined,
        undoFail: mv ? C.edit.cannotUndo : undefined,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [data, pendingOpen, goTo, openPanel, layout, view, router]);

  // 끌어 넣기(U3) — 낙관적 항목 입구(지도·패널 "넣을 것" 줄이 같이 씀). 저장은 패널 [넣기]와 같은 입구(addLinkAction → saveNodeLink),
  // 되돌리기도 같은 것(undoLinksAction) — 되돌리기는 응답 전에 위성을 숨기고 실패하면 다시 보인다.
  const links = useMemo<OptLinks>(() => {
    const show = (o: Omit<OptLink, "id" | "saved">) => {
      const id = ++optSeqRef.current;
      setOptLinks((l) => putOptLink(l, { ...o, id, saved: false }));
      return id;
    };
    const saved = (id: number) => setOptLinks((l) => l.map((o) => (o.id === id ? { ...o, saved: true } : o)));
    const hide = (id: number) => setOptLinks((l) => l.filter((o) => o.id !== id));
    return {
      show,
      saved,
      hide,
      refresh: () => router.refresh(),
      undo: async (planet, sat, created) => {
        // 이야기에 사람 — 그 넣기로 시기 연결이 새로 생겼으면(올린 것 아님) 시기에서도 숨김(서버 undoLinks 와 같게)
        const alsoPeriod = sat.type === "PERSON" && planet.type === "EPISODE" && created.some((c) => !c.downgrade && (c.a.type === "LIFE_EVENT" || c.b.type === "LIFE_EVENT"));
        const id = show({ op: "remove", planet, sat, alsoPeriod });
        const r = await undoLinksAction(created).catch(() => ({ ok: false as const }));
        if (r.ok) saved(id);
        else hide(id);
        router.refresh();
        return r;
      },
      decorate: async (planet, shape) => {
        const id = ++optSeqRef.current;
        setOptDecor((l) => putOptDecor(l, { id, planet, shape, saved: false }));
        const r = await setDecorationAction(planet, shape).catch(() => ({ ok: false as const, error: "" }));
        if (r.ok) {
          setOptDecor((l) => l.map((o) => (o.id === id ? { ...o, saved: true } : o)));
          router.refresh();
        } else setOptDecor((l) => l.filter((o) => o.id !== id));
        return r;
      },
    };
  }, [router]);

  function openFind() {
    setMapNotice(null);
    setFindOpen(true);
  }

  // 지도 질문 답하기(custom-graph 3a) — 찾기 시트에 적던 말을 이어서. 적은 말 없이 다시 열면 지난 답 그대로.
  function openAsk(q: string) {
    setFindOpen(false);
    if (q.trim() || askSeed === null) setAskSeed(q);
    setAskOpen(true);
  }

  function openSuggest() {
    setMapNotice(null);
    setSuggestOpen(true);
  }

  function openCreate(k: CreateKind | null, preset?: CreatePreset) {
    setMapNotice(null);
    setCreatePreset(preset);
    setCreateKind(k);
  }

  function afterCreate(r: Created) {
    setCreateKind(undefined);
    setPendingOpen(r);
    router.refresh();
  }

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-h))] bg-canvas text-ink">
      {view === "map" ? (
        <MapMode
          data={data}
          idx={idx}
          layout={layout}
          folded={folded}
          setFolded={setFolded}
          toggleFold={toggleFold}
          shownGroups={shownGroups}
          setShownGroups={setShownGroups}
          selected={selected}
          setSelected={setSelected}
          openPanel={openPanel}
          onToggleView={toggleView}
          onOpenFind={openFind}
          onCreate={openCreate}
          shownPlaceGroups={shownPlaceGroups}
          setShownPlaceGroups={setShownPlaceGroups}
          focusRequest={focusRequest}
          status={mapNotice}
          tour={tour}
          setTour={setTour}
          links={links}
          initialArea={initialArea}
          cats={{
            open: openCats,
            setOpen: setOpenCats,
            setMore: setMoreCats,
            setShownGroups: setShownCustomGroups,
            onPutIn: (categoryId) => {
              setPickKey(`cat:${categoryId}`);
              openPanel(`cat:${categoryId}`);
            },
          }}
        />
      ) : (
        <ListMode data={data} idx={idx} suggest={suggest} openPanel={openPanel} onToggleView={toggleView} onOpenFind={openFind} onCreate={openCreate} status={mapNotice} />
      )}

      <p className="sr-only" aria-live="polite">
        {mapNotice}
      </p>

      <dialog
        ref={dialogRef}
        aria-labelledby="mylife-panel-title"
        onClose={onDialogClose}
        onClick={(e) => {
          // 덮개 누름 = 닫기. "넣을 것" 줄에서 끌어 올리고 손을 뗀 클릭은 빼고(U3)
          if (e.target === dialogRef.current && Date.now() - openedAtRef.current > 400 && !dragJustEnded()) dialogRef.current.close();
        }}
        className={`inset-x-0 bottom-0 top-auto mx-auto mb-0 w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim ${view === "map" ? "max-h-[50dvh]" : "max-h-[75dvh]"}`}
      >
        <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
          {panel && (
            <PanelBody
              nodeKey={panel}
              data={data}
              idx={idx}
              folded={folded}
              showFold={view === "map"}
              onToggleFold={(id) => {
                toggleFold(id);
                dialogRef.current?.close();
              }}
              onGo={goTo}
              fromSat={panelFromSat && view === "map"}
              notice={notice}
              setNotice={setNotice}
              links={links}
              startEdit={panel === editKey}
              startPick={panel === pickKey}
              fromCategory={panelFromCat}
              onReopen={(r) => {
                setPendingOpen({ ...r, keep: true });
                router.refresh();
              }}
              related={
                relatedCount > 0 && panel === selected
                  ? {
                      count: relatedCount,
                      go: () => {
                        focusTourRef.current = true;
                        dialogRef.current?.close();
                        setTour((t) => ({ sel: panel, at: 1, n: (t?.n ?? 0) + 1 }));
                      },
                    }
                  : null
              }
              onDeleted={(name) => {
                setSelected(null);
                setMapNotice(C.edit.deletedName(name));
                dialogRef.current?.close();
              }}
            />
          )}
          <Button variant="tertiary" size="lg" onClick={() => dialogRef.current?.close()}>
            {C.close}
          </Button>
        </div>
      </dialog>

      <dialog
        ref={findRef}
        aria-labelledby="mylife-find-title"
        onClose={() => setFindOpen(false)}
        onClick={(e) => {
          if (e.target === findRef.current) findRef.current.close();
        }}
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim"
      >
        {findOpen && <FindSheet data={data} onPick={(r) => goTo(r.key, r.eventId)} onAsk={openAsk} onClose={() => findRef.current?.close()} />}
      </dialog>

      <dialog
        ref={askRef}
        aria-labelledby="mylife-ask-title"
        onClose={() => setAskOpen(false)}
        onClick={(e) => {
          if (e.target === askRef.current) askRef.current.close();
        }}
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim"
      >
        {askSeed !== null && (
          <AskSheet
            key={askSeed}
            seed={askSeed}
            onGo={(key, eventId) => {
              setAskOpen(false);
              goTo(key, eventId);
            }}
            onClose={() => askRef.current?.close()}
          />
        )}
      </dialog>

      <dialog
        ref={suggestRef}
        aria-labelledby="mylife-suggest-title"
        onClose={() => setSuggestOpen(false)}
        onClick={(e) => {
          if (e.target === suggestRef.current) suggestRef.current.close();
        }}
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim"
      >
        {suggestOpen && (
          <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
            <h2 id="mylife-suggest-title" className="m-0">
              {C.suggest}
            </h2>
            <InterviewEntryCard state={suggest.interview} as="h3" />
            <GapCards gaps={suggest.gaps} as="h3" />
            <Button variant="tertiary" size="lg" onClick={() => suggestRef.current?.close()}>
              {C.close}
            </Button>
          </div>
        )}
      </dialog>

      <dialog
        ref={createRef}
        aria-labelledby="mylife-create-title"
        onClose={() => setCreateKind(undefined)}
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim"
      >
        {createKind !== undefined && (
          <CreateSheet
            key={createKind ?? "pick"}
            data={data}
            initialKind={createKind}
            preset={createPreset}
            onDone={afterCreate}
            onClose={() => createRef.current?.close()}
            // [이야기 거리] — 지도 머리 줄에서 옮김(ui-space §6.2): 만들기 시트 맨 아래 → 같은 시트(오늘의 인터뷰·더 들어볼까요?)
            onSuggest={() => {
              createRef.current?.close();
              openSuggest();
            }}
          />
        )}
      </dialog>
    </div>
  );
}

// ── 지도(자유 이동 캔버스) ──────────────────────────────────────────────

type Init = { scale: number; x: number; y: number };
// 지도에서 노드로 가기 요청 — n 이 바뀔 때 한 번만 처리(레이아웃이 바뀔 때마다 다시 그 노드로 가던 것 — 3단계 E2E 2026-11-02).
type FocusRequest = { key: string; n: number; keep?: boolean };
// 연결된 곳 차례 보기 — sel = 고른 노드(바뀌면 끝) · at = 지금 보는 연결 순번(1~N, 0 = 고른 노드로 돌아감) · n = 요청 번호(한 번만 이동).
type Tour = { sel: string; at: number; n: number };

const fitScaleOf = (w: number, h: number, layout: MyLifeLayout) => Math.min(w / layout.width, h / layout.height);

function MapMode({
  data,
  idx,
  layout,
  folded,
  setFolded,
  toggleFold,
  shownGroups,
  setShownGroups,
  selected,
  setSelected,
  openPanel,
  onToggleView,
  onOpenFind,
  onCreate,
  shownPlaceGroups,
  setShownPlaceGroups,
  focusRequest,
  status,
  tour,
  setTour,
  links,
  initialArea,
  cats,
}: {
  data: MyLifeData;
  idx: Index;
  layout: MyLifeLayout;
  folded: Set<string>;
  setFolded: (s: Set<string>) => void;
  toggleFold: (eventId: string) => void;
  shownGroups: string[];
  setShownGroups: (g: string[]) => void;
  selected: string | null;
  setSelected: (k: string | null) => void;
  openPanel: (key: string, fromSat?: boolean, fromCat?: string | null) => void;
  onToggleView: () => void;
  onOpenFind: () => void;
  onCreate: (kind: CreateKind | null, preset?: CreatePreset) => void;
  shownPlaceGroups: string[];
  setShownPlaceGroups: (g: string[]) => void;
  focusRequest: FocusRequest | null;
  status: string | null; // 지운 뒤 알림 — 지도 위 줄에(다음 동작 전까지)
  tour: Tour | null; // 연결된 곳 차례 보기(패널 버튼이 시작, 선택 줄 [다음 연결]이 다음 곳)
  setTour: (t: Tour | null) => void;
  links: OptLinks; // 끌어 넣기 — 낙관적 항목·되돌리기(MyLifeView)
  initialArea: "people" | "places" | null; // ?area= — 준비된 뒤 한 번 그 영역으로(인물록 통합)
  // 사용자 카테고리(custom-graph 2단계) — 펼침(Q82 ②)·[더 보기](①)·묶음 칩·[+ 넣기]
  cats: {
    open: Set<string>;
    setOpen: (f: (prev: Set<string>) => Set<string>) => void;
    setMore: (f: (prev: Set<string>) => Set<string>) => void;
    setShownGroups: (f: (prev: string[]) => string[]) => void;
    onPutIn: (categoryId: string) => void;
  };
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [regionTop, setRegionTop] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [init, setInit] = useState<Init | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string | null>(data.events[0]?.id ?? null);
  // 화면 가운데가 인물록·장소록 쪽이면 "지금 보는 곳"을 시간 줄기 대신 그 이름으로.
  const [area, setArea] = useState<"timeline" | "people" | "places" | "categories">("timeline");
  const [catSheet, setCatSheet] = useState(false); // 이동 줄 [다른 카테고리] 시트
  const [scale, setScale] = useState(1);
  const [announce, setAnnounce] = useState("");
  // 공전(U2 — ui-space §2.2): [움직임 멈추기] 기기 기억 · reduced-motion 이면 처음부터 멈춤 · 전체 보기 배율(0.6 미만)도 멈춤.
  // 멈춤 = 그 자리에서(animation-play-state) — 다시 움직이면 튀지 않고 이어짐.
  const motionPref = useSyncExternalStore(subscribeMotion, readMotion, () => "run" as const);
  const motion = motionPref === "stop" || scale < OVERVIEW_SCALE ? "hold" : "run";
  const motionRef = useRef(motion);
  // 끌어 넣기(U3 — ui-space §4): 집은 동안 지도 이동·확대 끔 · 놓은 뒤 알림(+ [되돌리기], 다음 동작 전까지) · 끄는 중 낭독 줄.
  const [grabbing, setGrabbing] = useState(false);
  // 놓은 뒤 알림 — owner = 그 끌기 번호(저장 응답이 뒤 동작의 알림을 덮지 않게) · saving = 저장 응답 전([되돌리기] 아직 못 누름).
  const [dropNotice, setDropNotice] = useState<{ text: string; undo?: () => Promise<{ ok: boolean }>; saving?: boolean; owner?: number } | null>(null);
  const dropSeqRef = useRef(0);
  const [dragStatus, setDragStatus] = useState("");
  // 손가락으로 누르면 지도 라이브러리의 "화살표 키용 포커스"를 건너뜀(onInit 에서 감쌈) — 큰 문서 전체 스타일 계산(300 노드 4배 감속
  // 약 175ms)이 탭마다 들던 것. 마우스·키보드는 그대로(누른 뒤 화살표 이동).
  const lastPointerRef = useRef("mouse");


  // U1 — 간선은 그리지 않는다(Q114). 연결된 노드(윤곽)·차례 보기 순서만 쓴다.
  const { related, connected } = useMemo(() => selectionEdges(data, layout, selected, ALL_EDGES), [data, layout, selected]);

  // 콜백이 읽는 최신 값(렌더 중에는 읽지도 쓰지도 않는다).
  const layoutRef = useRef(layout);
  const savedRef = useRef({ folded, shownGroups, shownPlaceGroups, openCats: cats.open });
  const stateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const initDoneRef = useRef(false);
  const restoreRef = useRef<Saved | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    savedRef.current = { folded, shownGroups, shownPlaceGroups, openCats: cats.open };
  }, [layout, folded, shownGroups, shownPlaceGroups, cats.open]);

  // 페이지 자체 스크롤을 잠근다 — 지도 영역의 끌기·확대가 페이지 스크롤·브라우저 확대와 다투지 않게.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const measure = () => {
      if (regionRef.current) setRegionTop(regionRef.current.getBoundingClientRect().top + window.scrollY);
      const b = boxRef.current;
      if (!b) return;
      const w = b.clientWidth;
      const h = b.clientHeight;
      setBox({ w, h });
      // 처음 화면(1회) — 첫 중심이 위쪽(좁은 화면 가운데, 넓은 화면은 줄기가 왼쪽 30% — 인물록이 같이 보이게), 배율 1.
      // 라이브러리의 "처음 값"(키 0 = 처음 화면)은 언제나 이 자리 — 같은 탭 복원은 초기화 직후 이동으로.
      if (initDoneRef.current || h < 50) return;
      initDoneRef.current = true;
      const first = layoutRef.current.bands[0];
      const trunkAt = w >= 768 ? w * 0.3 : w / 2;
      setInit({ scale: 1, x: trunkAt - L.TRUNK_X, y: 16 - (first ? first.top : L.TOP_PAD) });
      const saved = readSaved();
      if (saved) {
        restoreRef.current = saved;
        // ?focus= 로 온 이야기의 띠는 접어 두지 않는다(그 노드로 가야 하므로).
        const focusEvent = focusRequest?.key.startsWith("st:") ? focusRequest.key.split(":")[1] : null;
        setFolded(new Set(saved.folded.filter((id) => id !== focusEvent && data.events.some((e) => e.id === id))));
        setShownGroups(saved.shownGroups.filter((id) => data.groups.some((g) => g.id === id)));
        setShownPlaceGroups((saved.shownPlaceGroups ?? []).filter((id) => data.placeGroups.some((g) => g.id === id)));
        const catIds = new Set(customOf(data).categories.map((c) => c.id));
        const open = (saved.openCats ?? []).filter((id) => catIds.has(id));
        if (open.length > 0) cats.setOpen((prev) => new Set([...prev, ...open]));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener("resize", measure);
    return () => {
      html.style.overflow = prev;
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // 마운트 1회(측정·초기 위치는 첫 데이터 기준).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => {
    const st = stateRef.current;
    const v = savedRef.current;
    writeSaved({ scale: st.scale, x: st.positionX, y: st.positionY, folded: [...v.folded], shownGroups: v.shownGroups, shownPlaceGroups: v.shownPlaceGroups, openCats: [...v.openCats], edges: ALL_EDGES });
  }, []);

  // 자유 이동이라 경계 제한은 두지 않되, 움직임이 멈추면 지도가 화면에서 다 사라지지 않게 되돌린다.
  const keepInView = useCallback(() => {
    const api = apiRef.current;
    const b = boxRef.current;
    if (!api || !b) return;
    const { scale: sc, positionX: x, positionY: y } = stateRef.current;
    const cw = layoutRef.current.width * sc;
    const ch = layoutRef.current.height * sc;
    const kx = Math.min(KEEP_VISIBLE, cw);
    const ky = Math.min(KEEP_VISIBLE, ch);
    const nx = clamp(x, kx - cw, b.clientWidth - kx);
    const ny = clamp(y, ky - ch, b.clientHeight - ky);
    if (Math.abs(nx - x) > 0.5 || Math.abs(ny - y) > 0.5) api.setTransform(nx, ny, sc, 200);
  }, []);

  useEffect(() => {
    if (ready) save();
  }, [ready, folded, shownGroups, shownPlaceGroups, save]);

  // 매 프레임 — "지금 보는 곳"·배율 표시는 다음 프레임에 한 번만 갱신.
  const onTransform = useCallback(
    (_ref: ReactZoomPanPinchRef, st: { scale: number; positionX: number; positionY: number }) => {
      stateRef.current = st;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const w = boxRef.current?.clientWidth ?? 0;
        const h = boxRef.current?.clientHeight ?? 0;
        const s = stateRef.current;
        const lay = layoutRef.current;
        const cx = (w / 2 - s.positionX) / s.scale;
        const cy = (h / 2 - s.positionY) / s.scale;
        const firstCat = lay.regions.categories[0]?.rect.y ?? Infinity;
        setArea(cx < lay.regions.people.x ? "timeline" : cy < lay.regions.places.y ? "people" : cy < firstCat ? "places" : "categories");
        setCurrent(bandAt(lay, cy)?.eventId ?? null);
        setScale(s.scale);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          keepInView();
          save();
        }, 250);
      });
    },
    [save, keepInView],
  );

  // 노드가 지도에서 보이는 곳(패널이 열려 있으면 패널 위까지) 밖에 있으면 — 배율은 그대로, 보이는 곳 안(여백 24)으로만 옮긴다.
  // 일부라도 보이면 그대로(3단계 E2E 2026-11-02 — 패널 작업 뒤 지도 위치·배율 유지, 밀려난 경우만 이동).
  const ensureVisible = useCallback((key: string) => {
    const b = boxRef.current;
    const el = b?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`);
    if (!b || !el) return;
    const r = el.getBoundingClientRect();
    const w = b.getBoundingClientRect();
    const panel = document.querySelector("dialog[open]");
    const bottom = Math.min(w.bottom, panel ? panel.getBoundingClientRect().top : w.bottom);
    if (!(r.right <= w.left || r.left >= w.right || r.bottom <= w.top || r.top >= bottom)) return;
    const m = 24;
    const dx = r.left < w.left + m ? w.left + m - r.left : r.right > w.right - m ? Math.max(w.left + m - r.left, w.right - m - r.right) : 0;
    const dy = r.top < w.top + m ? w.top + m - r.top : r.bottom > bottom - m ? Math.max(w.top + m - r.top, bottom - m - r.bottom) : 0;
    if (dx || dy) apiRef.current?.panBy(dx, dy, 200);
  }, []);

  // 공전 — 화면 안(한 화면 여유) 계만 돎. 배치가 바뀌면(넣기·접기·데이터) 새 계까지 다시 붙임(./orbit, 프레임마다 도는 코드 없음).
  useEffect(() => {
    // 기준 = 지도 라이브러리의 감싼 상자(overflow 로 자르는 가장 가까운 조상 — 지도 상자로 하면 그 자름이 여유를 지움).
    const root = boxRef.current?.querySelector<HTMLElement>(".react-transform-wrapper");
    if (!ready || !root) return;
    // 이미 도는 계도 위성 수·자리가 바뀌었을 수 있다(넣기·빼기 뒤) — 새 자리(data-frac)로 새로 시작해 겹쳐 돌지 않게(U3 실측).
    resyncOrbits(root);
    return observeOrbits(root);
  }, [ready, layout]);
  useLayoutEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  // 고른 행성 = 그 계 위성만 멈추고 펼침(Q110), 풀리면 그 자리에서 다시 공전. 다른 계는 계속 돎.
  // 펼침은 탭 처리 안에서 바로(그 계에 [data-open] + 300ms 이동 — 지도 전체를 다시 그리기 전에 멈춤, 300 노드 탭 → 정지 237~262ms 이던 것).
  // 이 이펙트는 접힘(앞 행성)만 — 찾기·만들기로 고른 행성은 펼침 자리로 바로(시작점 없음).
  const openSysRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const prev = openSysRef.current;
    const next = selected && /^(ev|st):/.test(selected) ? selected : null;
    if (prev === next) return;
    openSysRef.current = next;
    const b = boxRef.current;
    const sysOf = (k: string) => b?.querySelector(`.orbit-sys[data-sys="${CSS.escape(k)}"]`) ?? null;
    if (prev) {
      const el = sysOf(prev);
      if (el) animateClose(el, motionRef.current === "run");
    }
  }, [selected, layout]);

  // 검색 결과·"여기로 가기" — 노드를 화면 가운데·배율 1 이상으로(접힌 띠는 부모가 이미 펼침 → 다음 그림에서).
  // 요청 하나(n)는 한 번만 — 처리한 뒤 넣기·빼기로 레이아웃이 바뀌어도 그 노드로 다시 가지 않는다(3단계 E2E 2026-11-02).
  // keep = 확대 없이 보이는 곳 밖일 때만 옮김(패널이 열린 뒤 — 다음 그림에서).
  const focusDoneRef = useRef(0);
  useEffect(() => {
    if (!focusRequest || !ready || focusDoneRef.current === focusRequest.n) return;
    const el = boxRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(focusRequest.key)}"]`);
    if (!el) return;
    focusDoneRef.current = focusRequest.n;
    const key = focusRequest.key;
    if (focusRequest.keep) requestAnimationFrame(() => ensureVisible(key));
    // 두 프레임 뒤 — 첫 선택이면 선택 줄이 생겨 지도 상자 높이가 바뀌고(ResizeObserver → 다시 그림) 그때 이동 애니메이션이 끊겼다
    // (2026-11-07 실측: 찾기·AI 답 칩 → 선택은 되는데 화면 밖 노드로 안 감).
    else requestAnimationFrame(() => requestAnimationFrame(() => apiRef.current?.zoomToElement(el, Math.max(stateRef.current.scale, 1), 300)));
    // 검색 시트·패널(<dialog>)이 닫히며 포커스를 연 버튼으로 되돌리므로, 그 뒤에 노드로 옮긴다.
    setTimeout(() => el.focus({ preventScroll: true }), 60);
  }, [focusRequest, layout, ready, ensureVisible]);

  // 패널 작업 뒤(넣기·빼기·되돌리기 → router.refresh 로 데이터가 바뀜) — 지도 위치·배율은 그대로.
  // 고른 노드가 밀려(지도 위 자리가 바뀌어) 보이는 곳 밖으로 나갔을 때만 그 노드로. 제자리면 원래 패널에 가려 있었어도 그대로
  // (3단계 E2E 2026-11-02).
  const dataRef = useRef(data);
  const prevLayoutRef = useRef(layout);
  useEffect(() => {
    const prevLayout = prevLayoutRef.current;
    prevLayoutRef.current = layout;
    if (dataRef.current === data) return;
    dataRef.current = data;
    if (!ready || !selected) return;
    const was = prevLayout.nodes.find((n) => n.key === selected);
    const now = layout.nodes.find((n) => n.key === selected);
    if (!now || (was && was.x === now.x && was.y === now.y)) return;
    const raf = requestAnimationFrame(() => ensureVisible(selected));
    return () => cancelAnimationFrame(raf);
  }, [data, layout, ready, selected, ensureVisible]);

  const fitAll = useCallback(() => {
    const api = apiRef.current;
    const b = boxRef.current;
    if (!api || !b) return;
    const s = Math.min(fitScaleOf(b.clientWidth, b.clientHeight, layoutRef.current), MAX_SCALE);
    api.setTransform((b.clientWidth - layoutRef.current.width * s) / 2, Math.max(0, (b.clientHeight - layoutRef.current.height * s) / 2), s, 250);
    setAnnounce(C.zoomAnnounce(Math.round(s * 100)));
  }, []);

  // 인물록 통합(2026-11-06) — ?area=people|places 로 들어오면 준비된 뒤 한 번 그 영역으로(아래 goRegion 과 같은 자리, 움직임 없이).
  // 그 영역이 비었으면(사람·장소 0) 시간 줄기 그대로.
  const areaDoneRef = useRef(false);
  useEffect(() => {
    if (!ready || !initialArea || areaDoneRef.current) return;
    areaDoneRef.current = true;
    const api = apiRef.current;
    const r = layoutRef.current.regions[initialArea];
    if (!api || r.h === 0) return;
    const s = stateRef.current.scale < OVERVIEW_SCALE ? 1 : stateRef.current.scale;
    api.setTransform(24 - r.x * s, 24 - r.y * s, s, 0);
  }, [ready, initialArea]);

  // 가장자리 버튼 — 인물록·장소록은 그 영역 제목이 화면 왼쪽 위에 오게, 시간 줄기는 줄기가 가운데 오게(높이 유지).
  // 전체 보기 배율(0.6 미만)에서 누르면 배율 1 로.
  // 사용자 카테고리 영역 — [다른 카테고리] 시트에서 고름. 접혀 있으면 펼친 다음 그림에서(영역 자리가 바뀌므로).
  function goCategory(id: string) {
    const go = () => {
      const api = apiRef.current;
      const r = layoutRef.current.regions.categories.find((c) => c.id === id)?.rect;
      if (!api || !r) return;
      const st = stateRef.current;
      const s = st.scale < OVERVIEW_SCALE ? 1 : st.scale;
      api.setTransform(24 - r.x * s, 24 - r.y * s, s, 300);
    };
    if (layoutRef.current.nodes.some((n) => n.kind === "catTitle" && n.categoryId === id && n.collapsed)) {
      cats.setOpen((prev) => new Set([...prev, id]));
      requestAnimationFrame(() => requestAnimationFrame(go));
    } else go();
  }

  function goRegion(which: "people" | "places" | "timeline") {
    const api = apiRef.current;
    const b = boxRef.current;
    if (!api || !b) return;
    const st = stateRef.current;
    const s = st.scale < OVERVIEW_SCALE ? 1 : st.scale;
    if (which === "timeline") {
      api.setTransform(b.clientWidth / 2 - L.TRUNK_X * s, st.positionY * (s / st.scale), s, 300);
      return;
    }
    const r = layoutRef.current.regions[which];
    api.setTransform(24 - r.x * s, 24 - r.y * s, s, 300);
  }
  // 연결된 곳 — 한꺼번에 맞추면 멀리 떨어진 이야기·인물록 때문에 배율이 너무 작아져(실측 0.09) 글씨를 못 읽는다.
  // 그래서 연결 노드를 지도 순서대로 하나씩, 배율 1 이상으로. 패널의 [연결된 곳 차례로 보기(N)]가 첫 곳으로 시작하고,
  // 진행 중엔 선택 줄 [다음 연결](연결 n/N) — 마지막 다음은 [처음으로] = 고른 노드로 돌아가고 끝(3단계 최종 E2E 2026-11-02).
  // 고른 노드가 바뀌거나(다른 노드 탭·선택 풀기) 연결이 줄면(간선 끄기) 끝. 요청 번호 하나는 한 번만 이동.
  const tourOrder = useMemo(() => {
    const on = new Set(connected);
    return layout.nodes.map((n) => n.key).filter((k) => on.has(k));
  }, [connected, layout]);
  const tourAt = tour && tour.sel === selected && tour.at <= tourOrder.length ? tour.at : 0;
  const tourText = tourAt > 0 ? C.tourLine(tourAt, tourOrder.length, nodeName(tourOrder[tourAt - 1], data, idx)) : "";
  const tourDoneRef = useRef(0);
  useEffect(() => {
    if (!tour || tour.n === tourDoneRef.current) return;
    tourDoneRef.current = tour.n;
    const key = tour.at === 0 ? tour.sel : tourOrder[tour.at - 1];
    const el = key ? boxRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`) : null;
    if (el) apiRef.current?.zoomToElement(el, Math.max(stateRef.current.scale, 1), 300);
  }, [tour, tourOrder]);

  // 노드 탭과 끌기 구분 — 누른 자리에서 8px 넘게 움직였으면 끌기(패널 안 염).
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY };
    lastPointerRef.current = e.pointerType;
    const src = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
    if (src && e.isPrimary) startDrag(src, e);
  }

  // 끌어 넣기(U3) — 끄는 것: 인물록·장소록 노드·모임 이름표·펼친 위성(다른 행성에 복사로 넣기). 놓는 곳: 이야기·시기 행성(이미 그
  // 행성 위성이면 빠짐 — 빛나지 않음). 저장은 패널 넣기와 같은 입구(onLink → addLinkAction → saveNodeLink, 서버가 소유·허용을 다시 확인).
  function startDrag(src: HTMLElement, e: React.PointerEvent) {
    const b = boxRef.current;
    const [type, id] = (src.dataset.drag ?? "").split(":");
    if (!b || !id || !(type === "PERSON" || type === "PLACE" || type === "PERSON_GROUP")) return;
    const ref: NodeRef = { type, id };
    const name = src.dataset.dragName ?? "";
    const planetOf = (key: string): NodeRef => {
      const [k, e1, s1] = key.split(":");
      return k === "ev" ? { type: "LIFE_EVENT", id: e1 } : { type: "EPISODE", id: s1 };
    };
    const me = ++dropSeqRef.current;
    let optId = 0; // 궤도에 든 위성(낙관적 항목)
    let created: CreatedLink[] = [];
    let text = "";
    const from = src.dataset.dragFrom ?? null;
    const planetEl = (k: string) => b.querySelector<HTMLElement>(`button[data-node-key="${CSS.escape(k)}"]`);
    const allowed = new Set(
      layoutRef.current.nodes.filter((n) => (n.kind === "event" || n.kind === "story") && n.key !== from && !linkedTo(n.key, ref)).map((n) => n.key),
    );
    beginPress({
      kind: type === "PLACE" ? "place" : type === "PERSON_GROUP" ? "group" : "person",
      name,
      origin: src,
      pointer: { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp },
      ghostHost: document.body,
      edgeBox: b,
      planets: screenPlanets,
      allowed,
      planetEl,
      onGrab: () => {
        lockMap(true);
        setGrabbing(true);
        setDropNotice(null);
        b.setAttribute("data-dragging", "");
        for (const k of allowed) planetEl(k)?.setAttribute("data-drop-ok", "");
        setDragStatus(C.space.grabHint(name));
      },
      onAutoPan: (dx, dy) => {
        const api = apiRef.current;
        if (!api) return;
        const st = api.instance.state;
        api.setTransform(st.positionX + dx, st.positionY + dy, st.scale, 0);
      },
      // 저장(서버만) — 화면은 onLand(궤도에 든 순간 위성 보임)·onSettled(결과)
      onDrop: async (key): Promise<DropResult> => {
        const r = await addLinkAction(planetOf(key), ref);
        if (!r.ok) return "failed";
        created = r.created;
        return r.created.length === 0 ? "already" : "added";
      },
      onLand: (key) => {
        optId = links.show({ op: "add", planet: planetOf(key), sat: ref, alsoPeriod: type === "PERSON" && key.startsWith("st:") });
        text = C.space.dropped(name, nodeName(key, data, idx));
        setDropNotice({ text, saving: true, owner: me });
      },
      onSettled: (key, r) => {
        if (r === "failed") {
          if (optId) links.hide(optId); // 위성이 빠지고 그림이 튕겨 제자리(drag.ts)
          setDropNotice({ text: C.space.dropFailed });
          return;
        }
        if (optId) links.saved(optId);
        links.refresh();
        if (r === "already") {
          setDropNotice((n) => (!n || n.owner === me ? { text: C.edit.alreadyLinked, owner: me } : n));
          return;
        }
        const planet = planetOf(key);
        const done = created;
        setDropNotice((n) => (n?.owner === me ? { text, undo: () => links.undo(planet, ref, done), owner: me } : n));
      },
      onBounce: (why) => {
        if (why === "far") setDropNotice({ text: C.space.dropFar });
        else if (why === "already") setDropNotice({ text: C.edit.alreadyLinked });
        else if (why === "cancel") setDropNotice({ text: C.space.dropCancel });
      },
      onEnd: () => {
        lockMap(false);
        setGrabbing(false);
        b.removeAttribute("data-dragging");
        b.querySelectorAll("[data-drop-ok]").forEach((x) => x.removeAttribute("data-drop-ok"));
        setDragStatus("");
      },
    });
  }

  // 집는 순간 지도 이동·확대를 바로 끔 — 라이브러리는 움직일 때마다 setup.panning.disabled 를 다시 읽는다(4.2.0). props(grabbing)만
  // 바꾸면 React 가 다시 그릴 때까지(바쁜 폰·4배 감속) 첫 이동 몇 개가 지도를 끌었다(390×667 실측). 끝나면 되돌림(곧 props 로도 같아짐).
  function lockMap(on: boolean) {
    lockPanZoom(apiRef.current?.instance, on);
  }

  // 그 행성에 이미 이어져 있나(위성으로 보이나) — 시기 = 바로 이은 사람·모임·장소, 이야기 = 작은 물방울(대상 인물 포함).
  function linkedTo(key: string, ref: NodeRef): boolean {
    const [k, e, s] = key.split(":");
    const ev = idx.eventById.get(e);
    if (!ev) return true;
    if (k === "ev") return ref.type === "PERSON" ? ev.personIds.includes(ref.id) : ref.type === "PLACE" ? ev.placeIds.includes(ref.id) : ev.groupIds.includes(ref.id);
    const st = ev.stories.find((x) => x.id === s);
    if (!st) return true;
    const ck = ref.type === "PERSON" ? "person" : ref.type === "PLACE" ? "place" : "group";
    return st.chips.some((c) => c.kind === ck && c.id === ref.id) || (ref.type === "PERSON" && st.subjectPersonId === ref.id);
  }

  // 놓을 후보 — 행성 가운데·궤도 반지름을 화면 좌표로(배치 값 × 지금 변환, DOM 을 읽지 않음 — 자동 이동 중에도 매번 계산).
  function screenPlanets(): DropPlanet[] {
    const api = apiRef.current;
    const w = boxRef.current?.querySelector(".react-transform-wrapper")?.getBoundingClientRect();
    if (!api || !w) return [];
    const st = api.instance.state;
    return layoutRef.current.nodes.flatMap((n) => {
      if (n.kind !== "event" && n.kind !== "story") return [];
      const o = orbitShape(n.planet.d, 0);
      return [{ key: n.key, cx: w.left + st.positionX + n.planet.cx * st.scale, cy: w.top + st.positionY + n.planet.cy * st.scale, rx: o.rx * st.scale, ry: o.ry * st.scale }];
    });
  }

  // 빈 곳 한 번 = 선택 풀기, 빈 곳 두 번(더블탭·더블클릭) = 그 지점 확대.
  function onPointerUp(e: React.PointerEvent) {
    const d = downRef.current;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    if ((e.target as HTMLElement).closest("[data-node-key]")) {
      lastTapRef.current = null;
      return;
    }
    setSelected(null);
    setDropNotice(null);
    const now = performance.now();
    const last = lastTapRef.current;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
      lastTapRef.current = null;
      const next = Math.min(stateRef.current.scale * DOUBLE_TAP_SCALE, MAX_SCALE);
      const { clientX, clientY } = e;
      // 손을 뗄 때 라이브러리의 끌기 마무리가 애니메이션을 취소하므로, 그 뒤에 확대한다.
      setTimeout(() => apiRef.current?.zoomToPoint(next, clientX, clientY, 200), 40);
      setAnnounce(C.zoomAnnounce(Math.round(next * 100)));
    } else {
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && selected) {
      setSelected(null);
      e.preventDefault();
    }
  }

  function onWorldClick(e: React.MouseEvent) {
    if (dragJustEnded()) return; // 끌어 넣기를 마친 손을 뗄 때 생긴 클릭
    const d = downRef.current;
    if (e.detail > 0 && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]");
    if (!el) return;
    const { nodeKey, nodeKind, eventId, groupId, region, createKind, targetKey } = el.dataset;
    if (!nodeKey) return;
    setDropNotice(null);
    // 한 번 탭 = 그 노드의 동작(패널 열기) — 노드 종류·배율과 무관(3단계 E2E 2026-11-02, Q60 보완).
    // 전체 보기 상태면 그 노드로 확대도 같이(패널에 가리지 않게 지도 위쪽에).
    if (stateRef.current.scale < OVERVIEW_SCALE) zoomAbovePanel(el);
    if (nodeKind === "fold" && eventId) toggleFold(eventId);
    // 고른 행성의 위성 = 그 분·곳·모임의 패널(바로가기 — Q99, 지도는 안 움직임)
    else if (nodeKind === "satellite" && targetKey) openPanel(targetKey, true);
    // 펼친 "+N" = 그 행성 패널(전체 목록) — 행성 다시 탭(접기)과 구분
    else if (nodeKind === "satMore" && targetKey) openPanel(targetKey);
    else if (nodeKind === "regionAdd" && createKind) onCreate(createKind as CreateKind);
    // 사용자 카테고리(custom-graph 2단계 — §6.6): 펼치기·접기 · [N개 더 보기] · [+ 항목]·[+ 묶음]·[+ 넣기] · 묶음 칩 · 바로가기(원래 노드 패널)
    else if ((nodeKind === "catFold" || nodeKind === "catMore") && el.dataset.categoryId) {
      const id = el.dataset.categoryId;
      const flip = (prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      };
      if (nodeKind === "catFold") cats.setOpen(flip);
      else cats.setMore(flip);
    } else if (nodeKind === "catAdd" && el.dataset.categoryId) {
      if (createKind === "putIn") cats.onPutIn(el.dataset.categoryId);
      else onCreate(createKind as CreateKind, { categoryId: el.dataset.categoryId });
    } else if (nodeKind === "catGroupChip" && groupId) {
      cats.setShownGroups((prev) => [groupId, ...prev.filter((g) => g !== groupId)]);
      openPanel(`cgl:${groupId}`);
    } else if (nodeKind === "catRef" && targetKey) openPanel(targetKey, false, el.dataset.categoryId ?? null);
    else if (nodeKind === "groupChip" && groupId) {
      // 칩(모임·장소 묶음 4개 이상 — 영역은 늘 3개) — 안 보이던 모임이면 영역으로 바꿔 넣고 + 그 모임 패널.
      // (예전 칩 탭 = 보이기·끄기였지만 끄면 레이아웃이 다른 모임으로 다시 3개를 채워 실제로는 바꾸기였다.)
      const places = region === "places";
      const shown = places ? layoutRef.current.shownPlaceGroupIds : layoutRef.current.shownGroupIds;
      if (!shown.includes(groupId)) {
        const next = [groupId, ...shown].slice(0, L.MAX_SHOWN_GROUPS);
        if (places) setShownPlaceGroups(next);
        else setShownGroups(next);
      }
      const key = `${places ? "pgl" : "gl"}:${groupId}`;
      openPanel(key);
      // 새로 들어온 영역 이름표가 보이는 곳(패널 위) 밖이면 그만큼만 — 영역이 다시 그려지고 패널이 열린 다음 그림에서.
      if (stateRef.current.scale >= OVERVIEW_SCALE) requestAnimationFrame(() => requestAnimationFrame(() => ensureVisible(key)));
    } else {
      const planet = !!nodeKind && PLANET_KINDS.has(nodeKind);
      // 고른 행성을 다시 탭 = 접고 다시 공전(U2 — 고르기 풀기). 패널은 닫혀 있다(열려 있으면 지도는 덮개 밑).
      if (planet && nodeKey === selected) {
        setSelected(null);
        return;
      }
      // 탭한 그 순간 그 계만 멈추고 지금 자리 → 펼침 자리로(./orbit animateOpen). [data-open] 은 곧 React 가 같은 값으로 그린다.
      const sys = planet ? boxRef.current?.querySelector<HTMLElement>(`.orbit-sys[data-sys="${CSS.escape(nodeKey)}"]`) : null;
      if (sys) {
        const from = snapshotSats(sys, motionRef.current === "run");
        sys.setAttribute("data-open", "");
        animateOpen(sys, from);
      }
      const open = () => {
        openPanel(nodeKey);
        // 행성 탭 = 펼침 + 패널(Q110) — 펼친 계(행성 + 위성)가 패널·지도 상자 밖에 걸리면 패널 위로(배율 그대로). 다 보이면 안 움직임.
        if (planet && stateRef.current.scale >= OVERVIEW_SCALE) liftAbovePanel(nodeKey);
      };
      // 멈춘 모습을 먼저 한 번 그린 뒤 패널 — 지도 다시 그리기·모달 열기(300 노드 4배 감속 약 0.5초)가 끝날 때까지 정지가 안 보이던 것.
      // 펼침 이동(300ms)은 합성기라 그동안에도 이어진다.
      if (sys) requestAnimationFrame(() => setTimeout(open, 0));
      else open();
    }
  }

  // 고른 행성의 계(행성 + 위성 — 위성 버튼 키 sat:<행성 키>:…, "+N" 칸은 행성 키)를 패널 위 보이는 띠 안으로.
  // 띠에 들어가면 가운데, 크면 위쪽 맞춤. 선택 줄·패널이 생긴 다음 그림에서 잰다(zoomAbovePanel 과 같은 시점).
  function liftAbovePanel(key: string) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const b = boxRef.current;
        const api = apiRef.current;
        if (!b || !api) return;
        const parts = [...b.querySelectorAll<HTMLElement>(`[data-node-key="${CSS.escape(key)}"], [data-node-key^="${CSS.escape(`sat:${key}:`)}"]`)];
        if (parts.length === 0) return;
        const st = api.instance.state; // 지금 변환 — stateRef 는 첫 사용자 이동 전엔 처음 값(0)이라 가로로 밀렸다
        const w = b.getBoundingClientRect();
        const panelEl = document.querySelector("dialog[open]");
        const top = w.top + 8;
        const bottom = Math.min(w.bottom, panelEl ? panelEl.getBoundingClientRect().top : w.bottom) - 8;
        const rs = parts.map((p) => p.getBoundingClientRect());
        const rTop = Math.min(...rs.map((r) => r.top));
        const rBottom = Math.max(...rs.map((r) => r.bottom));
        if (rTop >= top && rBottom <= bottom) return;
        const dy = rBottom - rTop <= bottom - top ? (top + bottom - rTop - rBottom) / 2 : top - rTop;
        api.setTransform(st.positionX, st.positionY + dy, st.scale, 300);
      }),
    );
  }

  // 전체 보기에서 누른 노드 — 배율 1, 패널 위 보이는 띠 안에(들어가면 가운데, 크면 위쪽 맞춤).
  // 탭하면 선택 줄이 생겨 지도 상자가 내려가고 패널이 열리므로, 그 다음 그림에서 잰다.
  function zoomAbovePanel(el: HTMLElement) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const b = boxRef.current;
        const api = apiRef.current;
        if (!b || !api || !el.isConnected) return;
        const st = stateRef.current;
        const r = el.getBoundingClientRect();
        const w = b.getBoundingClientRect();
        const panel = document.querySelector("dialog[open]");
        const bottom = Math.min(w.bottom, panel ? panel.getBoundingClientRect().top : w.bottom);
        const cx = (r.left + r.width / 2 - w.left - st.positionX) / st.scale;
        const cy = (r.top + r.height / 2 - w.top - st.positionY) / st.scale;
        const h = r.height / st.scale;
        const y = h <= bottom - w.top - 16 ? (w.top + bottom) / 2 : w.top + 8 + h / 2;
        api.setTransform(w.width / 2 - cx, y - w.top - cy, 1, 300);
      }),
    );
  }

  // Tab 으로 화면 밖 노드에 포커스가 가면 — 감싼 상자가 브라우저 기본 스크롤로 어긋나지 않게 되돌리고,
  // 그 노드가 화면 안(여백 24)에 오도록 지도를 옮긴다. 지도 이동은 키보드 포커스(:focus-visible)일 때만 — 탭·패널 닫기로
  // 포커스가 노드에 갈 때 지도가 움직이지 않게(3단계 E2E 2026-11-02 — 전체 보기 탭의 확대와 겹치던 것 · 패널 작업 뒤 지도 유지).
  function onFocusIn(e: React.FocusEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (!el.dataset.nodeKey) return;
    const wrap = e.currentTarget;
    requestAnimationFrame(() => {
      wrap.scrollTop = 0;
      wrap.scrollLeft = 0;
      if (!el.matches(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const m = 24;
      const dx = r.left < w.left + m ? w.left + m - r.left : r.right > w.right - m ? Math.max(w.left + m - r.left, w.right - m - r.right) : 0;
      const dy = r.top < w.top + m ? w.top + m - r.top : r.bottom > w.bottom - m ? Math.max(w.top + m - r.top, w.bottom - m - r.bottom) : 0;
      if (dx || dy) apiRef.current?.panBy(dx, dy, 150);
    });
  }

  const minScale = box ? Math.min(MIN_SCALE, fitScaleOf(box.w, box.h, layout)) : MIN_SCALE;
  const anyFolded = folded.size > 0;
  const currentEvent = data.events.find((e) => e.id === current);
  // "지금 보는 곳" 글 줄은 뺐다(ui-space §6.2) — 보는 시기는 행성 고리(aria-current)와 지도 상자 낭독 이름으로.
  const regionLabel = currentEvent
    ? C.space.regionAt(currentEvent.year === null ? `${currentEvent.label}(${C.yearUnknown})` : `${yearText(currentEvent)} ${currentEvent.label}`)
    : C.mapRegionLabel;

  return (
    <div ref={regionRef} className="flex flex-col" style={{ height: regionTop ? `calc(100dvh - ${regionTop}px)` : "calc(100dvh - 72px)", minHeight: 420 }}>
      <div className="flex items-center justify-between gap-2 px-6 pt-3">
        {/* 390 에서 제목 한 줄(2026-11-04 — 두 줄로 꺾여 지도 높이 35px 를 먹었다): 제목은 안 꺾고, 좁은 화면은 [찾기]·[목록으로 보기]
            좌우 여백 16 → 12px(제목 107 + 버튼 87·126 + 간격 = 336 / 342px). */}
        <h1 className="m-0 shrink-0 whitespace-nowrap text-[28px]">{C.pageTitle}</h1>
        <div className="flex shrink-0 gap-2">
          <ButtonLink href="/chat-v3" variant="primary" size="lg" className="hidden! px-4! sm:inline-flex!">
            <MessageCircle aria-hidden size={20} className="shrink-0" />
            {C.chatEntry}
          </ButtonLink>
          <Button variant="secondary" size="lg" className="hidden! px-4! sm:inline-flex!" onClick={() => onCreate(null)}>
            <Plus aria-hidden size={20} className="shrink-0" />
            {C.edit.create}
          </Button>
          <Button variant="secondary" size="lg" className="px-3! sm:px-4!" onClick={onOpenFind}>
            <Search aria-hidden size={20} className="shrink-0" />
            {C.find}
          </Button>
          <Button variant="secondary" size="lg" className="px-3! sm:px-4!" onClick={onToggleView}>
            {C.toList}
          </Button>
        </div>
      </div>
      {/* 기록 방법 1 — 채팅(My Life 개편 2단계). 390 에선 머리 줄에 자리가 없어 한 줄 아래 꽉 찬 버튼(sm 이상은 머리 줄 안). */}
      <div className="flex gap-2 px-6 pt-2 sm:hidden">
        <ButtonLink href="/chat-v3" variant="primary" size="lg" className="min-w-0 flex-1 px-3!">
          <MessageCircle aria-hidden size={20} className="shrink-0" />
          {C.chatEntry}
        </ButtonLink>
        <Button variant="secondary" size="lg" className="shrink-0 px-4!" onClick={() => onCreate(null)}>
          <Plus aria-hidden size={20} className="shrink-0" />
          {C.edit.create}
        </Button>
      </div>
      {selected ? (
        <>
          <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
            <p className="min-w-0 truncate text-lg text-ink">
              {tourAt > 0 ? tourText : C.selectedLine(nodeName(selected, data, idx), connected.length)}
            </p>
            <div className="flex shrink-0 gap-2">
              {tourAt > 0 && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="px-4!"
                  data-tour-next
                  aria-label={tourAt >= tourOrder.length ? C.tourBackLabel(nodeName(selected, data, idx)) : undefined}
                  onClick={() => {
                    const back = tourAt >= tourOrder.length;
                    setTour({ sel: selected, at: back ? 0 : tourAt + 1, n: (tour?.n ?? 0) + 1 });
                    // 끝 — 버튼이 사라지므로 포커스는 돌아간 고른 노드로(이동이 끝난 뒤 — 지도가 포커스 이동과 다투지 않게).
                    if (back) setTimeout(() => boxRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(selected)}"]`)?.focus({ preventScroll: true }), 320);
                  }}
                >
                  {tourAt >= tourOrder.length ? C.tourBack : C.tourNext}
                </Button>
              )}
              <Button variant="secondary" size="lg" className="px-4!" onClick={() => setSelected(null)}>
                {C.clearSelection}
              </Button>
            </div>
            <p className="sr-only" aria-live="polite">
              {tourAt > 0 ? tourText : ""}
            </p>
          </div>
        </>
      ) : (
        // U1(ui-space §6.2) — "지금 보는 곳" 글 줄·[이야기 거리] 줄을 뺐다. 지운 뒤 알림이나 접힌 띠가 있을 때만 이 줄이 생긴다.
        (status || anyFolded) && (
          <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
            <p className="min-w-0 truncate text-lg text-ink">{status}</p>
            {anyFolded && (
              <Button variant="secondary" size="lg" className="shrink-0 px-4!" onClick={() => setFolded(new Set())}>
                {C.unfoldAll}
              </Button>
            )}
          </div>
        )
      )}

      {/* 공전 키프레임(약 42KB) — 지도가 그려질 때만(서버 HTML 에 싣지 않음) */}
      {init && <style>{ORBIT_CSS}</style>}
      <div ref={boxRef} data-motion={motion} className="space-map relative min-h-0 flex-1 overflow-hidden border-y border-line">
        {dropNotice && (
          <div role="status" className="absolute inset-x-0 top-0 z-10 flex min-h-[56px] items-center justify-between gap-3 border-b border-line bg-surface px-6 py-1">
            <p className="min-w-0 text-lg text-ink">{dropNotice.text}</p>
            {(dropNotice.undo || dropNotice.saving) && (
              <Button
                variant="secondary"
                size="lg"
                className="shrink-0 px-4!"
                disabled={!dropNotice.undo}
                onClick={async () => {
                  const u = dropNotice.undo!;
                  setDropNotice(null);
                  const r = await u();
                  setDropNotice({ text: r.ok ? C.edit.undone : C.edit.cannotUnlink });
                }}
              >
                {C.edit.undo}
              </Button>
            )}
          </div>
        )}
        <p className="sr-only" aria-live="assertive">
          {dragStatus}
        </p>
        {init && (
          <TransformWrapper
            ref={apiRef}
            initialScale={init.scale}
            initialPositionX={init.x}
            initialPositionY={init.y}
            minScale={minScale}
            maxScale={MAX_SCALE}
            limitToBounds={false}
            wheel={{ step: 0.002 }} // 라이브러리가 |deltaY| 를 곱한다 — 마우스 휠 한 칸(≈120) ≈ 0.24배
            doubleClick={{ disabled: true }}
            keyboard={{ disabled: false, panStep: 80, zoomStep: 0.25 }}
            onTransform={onTransform}
            panning={{ disabled: grabbing }}
            pinch={{ disabled: grabbing }}
            onInit={(ref) => {
              // 손가락으로 누를 때는 "화살표 키용 포커스"를 건너뜀(위 lastPointerRef — 라이브러리 4.2.0 의 인스턴스 함수를 감쌈, 없으면 그대로)
              const inst = ref.instance as unknown as { focusForKeyboard?: () => void };
              const focusForKeyboard = inst.focusForKeyboard;
              if (typeof focusForKeyboard === "function") {
                inst.focusForKeyboard = () => {
                  if (lastPointerRef.current !== "touch") focusForKeyboard();
                };
              }
              const r = restoreRef.current;
              if (r) ref.setTransform(r.x, r.y, clamp(r.scale, 0.05, MAX_SCALE), 0);
              setReady(true);
            }}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              wrapperClass="focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand"
              contentStyle={{ width: layout.width, height: layout.height }}
              wrapperProps={
                {
                  role: "region",
                  "aria-label": regionLabel,
                  "data-ready": ready ? "1" : undefined,
                  onPointerDown,
                  onPointerUp,
                  onFocus: onFocusIn,
                  onKeyDown,
                } as React.HTMLAttributes<HTMLDivElement>
              }
            >
              <div className="relative" style={{ width: layout.width, height: layout.height }} onClick={onWorldClick}>
                <MapWorld data={data} idx={idx} layout={layout} folded={folded} current={current} selected={selected} related={related} />
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      {/* 도구줄 — 지도 위에 떠서 노드를 가리던 가장자리 버튼을 지도 밖으로(3단계 E2E 2026-11-02, §8.4).
          이동 줄 = 늘 같은 자리 [시간 줄기][인물록][장소록](지금 보는 곳 표시) · 아래 줄 = 확대·축소·전체 보기(오른쪽 = 비서 버튼 자리).
          위아래 여백 4px(2026-11-04 — 8 → 4, 지도 높이 12px 되찾기). */}
      <nav aria-label={C.moveBarLabel} className="flex items-center gap-2 bg-surface px-4 pt-1">
        {(["timeline", "people", "places"] as const)
          .filter((w) => w === "timeline" || layout.regions[w].h > 0)
          .map((w) => (
            <Button
              key={w}
              variant="secondary"
              size="lg"
              className={`px-3! ${area === w ? "border-ink! bg-banner!" : ""}`} // 지금 보는 곳 = 진한 테두리(지도의 지금 보는 시기 노드와 같은 표시)
              aria-current={area === w ? "true" : undefined}
              onClick={() => goRegion(w)}
            >
              {w === "timeline" ? C.toTimeline : w === "people" ? builtinName(data, "PEOPLE") : builtinName(data, "PLACES")}
            </Button>
          ))}
        {customOf(data).categories.length > 0 && (
          <Button
            variant="secondary"
            size="lg"
            className={`px-3! ${area === "categories" ? "border-ink! bg-banner!" : ""}`}
            aria-current={area === "categories" ? "true" : undefined}
            aria-haspopup="dialog"
            onClick={() => setCatSheet(true)}
          >
            {C.custom.toCategories}
          </Button>
        )}
      </nav>
      <CategorySheet open={catSheet} data={data} onPick={goCategory} onClose={() => setCatSheet(false)} />
      {/* 확대 줄(Q112 A): [−][+][전체][움직임 멈추기] — 비서 버튼 자리 96px(390 에서 쓸 수 있는 폭 278). */}
      <div className="flex items-center gap-2 bg-surface py-1 pl-4 pr-[96px]">
        <Button
          variant="secondary"
          size="lg"
          className="w-14 px-0!"
          aria-label={C.zoomOut}
          disabled={scale <= minScale + 0.001}
          onClick={() => {
            apiRef.current?.zoomOut(ZOOM_STEP, 200);
            setAnnounce(C.zoomAnnounce(Math.round(Math.max(minScale, scale - ZOOM_STEP) * 100)));
          }}
        >
          <Minus aria-hidden size={24} className="shrink-0" />
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-14 px-0!"
          aria-label={C.zoomIn}
          disabled={scale >= MAX_SCALE - 0.001}
          onClick={() => {
            apiRef.current?.zoomIn(ZOOM_STEP, 200);
            setAnnounce(C.zoomAnnounce(Math.round(Math.min(MAX_SCALE, scale + ZOOM_STEP) * 100)));
          }}
        >
          <Plus aria-hidden size={24} className="shrink-0" />
        </Button>
        <Button variant="secondary" size="lg" className="px-3!" aria-label={C.fitAll} onClick={fitAll}>
          {C.space.fitAllShort}
        </Button>
        {/* 움직임 멈추기(WCAG 2.2.2) — 누르면 [움직이기]로(이름이 바뀌는 버튼이라 aria-pressed 는 안 씀). 기기에 기억 */}
        <Button
          variant="secondary"
          size="lg"
          className="w-14 px-0!"
          aria-label={motionPref === "stop" ? C.space.motionStart : C.space.motionStop}
          data-motion-toggle
          onClick={() => {
            const next = motionPref === "stop" ? "run" : "stop";
            writeMotion(next);
            setAnnounce(next === "stop" ? C.space.motionStopped : C.space.motionStarted);
          }}
        >
          {motionPref === "stop" ? <Play aria-hidden size={24} className="shrink-0" /> : <Pause aria-hidden size={24} className="shrink-0" />}
        </Button>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}

// 지도 안 내용 — 확대·이동은 바깥 transform 만 바뀌어 다시 그리지 않는다(memo). 선택·지금 보는 시기가 바뀔 때만.
// U1(ui-space §1): 시기·이야기 = 행성(원 버튼), 그 아래 위성 칸(사람·모임·장소 바로가기 — 정지 = 펼침 자리). 위성은 그 행성을 골랐을
// 때만 따로 누르는 버튼(그 분·곳 패널 — Q99, 지도 안 움직임)이고, 안 골랐을 때는 행성 그림의 일부(누르면 행성 선택 — 낭독은 행성
// 이름에 들어 있어 숨김). 인물록·장소록 = 작은 행성 모음. 선택한 사람·장소(찾기 결과 포함)는 진짜 자리와 모든 위성에 빛 고리.
const MapWorld = memo(function MapWorld({
  data,
  idx,
  layout,
  folded,
  current,
  selected,
  related,
}: {
  data: MyLifeData;
  idx: Index;
  layout: MyLifeLayout;
  folded: Set<string>;
  current: string | null;
  selected: string | null;
  related: Set<string>;
}) {
  const byKey = new Map<string, LayoutNode>(layout.nodes.map((n) => [n.key, n]));
  const satsOf = new Map<string, LayoutSatellite[]>();
  for (const s of layout.satellites) {
    const list = satsOf.get(s.planetKey);
    if (list) list.push(s);
    else satsOf.set(s.planetKey, [s]);
  }
  const pos = (n: { x: number; y: number; w: number; h: number }) => ({ left: n.x, top: n.y, width: n.w, height: n.h });
  const circle = (p: { cx: number; cy: number; d: number }) => ({ left: p.cx - p.d / 2, top: p.cy - p.d / 2, width: p.d, height: p.d });
  const mark = (key: string): React.CSSProperties => (key === selected ? SELECTED_OUTLINE : related.has(key) ? RELATED_OUTLINE : {});
  const people = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "person" }> => n.kind === "person");
  const places = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "place" }> => n.kind === "place");
  const labelsOf = (r: "people" | "places") => layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "groupLabel" }> => n.kind === "groupLabel" && n.region === r);
  const chipsOf = (r: "people" | "places") => layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "groupChip" }> => n.kind === "groupChip" && n.region === r);
  const labels = labelsOf("people");
  const chips = chipsOf("people");
  const titleOf = (r: "people" | "places") => byKey.get(`title:${r}`);
  const subOf = (r: "people" | "places") => byKey.get(`sub:${r}`);
  const addOf = (r: "people" | "places") => byKey.get(`add:${r}`);
  // 영역 제목 옆 [+ 사람][+ 모임] / [+ 장소][+ 묶음] — 지도 노드(data-node-key)라 끌기와 구분되고 전체 보기에선 확대.
  const regionAdd = (r: "people" | "places") => {
    const n = addOf(r);
    if (!n) return null;
    const items: [CreateKind, string][] = r === "people" ? [["person", C.edit.regionAddPerson], ["group", C.edit.regionAddGroup]] : [["place", C.edit.regionAddPlace], ["placeGroup", C.edit.regionAddPlaceGroup]];
    return (
      <div className="absolute flex gap-2" style={pos(n)}>
        {items.map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-node-key={`add:${r}:${k}`}
            data-node-kind="regionAdd"
            data-create-kind={k}
            aria-label={C.edit.regionAddName(label)}
            className={buttonClasses("secondary", "lg", "flex-1 px-3!")}
          >
            <Plus aria-hidden size={20} className="shrink-0" />
            {label}
          </button>
        ))}
      </div>
    );
  };
  const placeLabels = labelsOf("places");
  const placeChips = chipsOf("places");
  // 위성(U2 — ui-space §2) — 행성 둘레를 도는 바로가기. 계 상자 하나(.orbit-sys)에 그 행성 위성을 모아 화면 안일 때만 공전
  // (./orbit observeOrbits). 위성은 늘 같은 <button>(공전 ↔ 펼침에서 같은 요소라 자리가 이어짐) — 공전 중엔 inert(누르는 곳 아님·
  // 낭독 안 함, 움직이는 표적 금지 §3.1), 행성을 고르면 그 계만 멈추고 아래 칸 줄로 펼쳐 바로가기 버튼(그 분·곳·모임 패널 — Q99,
  // "+N" = 행성 패널의 전체 목록). 자리 값: --rx·--ry 정지 자리 · --ex·--ey 펼침 자리 · --lo 정지 때 이름표(lib/space-orbit).
  const satTarget = (s: LayoutSatellite) => (s.ref ? `${s.ref.kind === "person" ? "pe" : s.ref.kind === "place" ? "pl" : "gl"}:${s.ref.id}` : null);
  const satName = (s: LayoutSatellite) =>
    s.ref ? (s.ref.kind === "person" ? idx.personById.get(s.ref.id)?.name : s.ref.kind === "place" ? idx.placeById.get(s.ref.id)?.name : idx.groupById.get(s.ref.id)?.name) ?? "" : "";
  const satellites = (n: Extract<LayoutNode, { kind: "event" | "story" }>, decor: string | null) => {
    const list = satsOf.get(n.key);
    if (!list) return null;
    const open = selected === n.key;
    return (
      <div className="orbit-sys pointer-events-none absolute" style={pos(n)} data-sys={n.key} data-open={open ? "" : undefined} data-decor={decor ?? undefined}>
        {list.map((s) => {
          const target = satTarget(s);
          const name = satName(s);
          const kind = s.ref?.kind ?? "person";
          const shape = orbitShape(n.planet.d, s.orbit);
          const rest = orbitPoint(shape, s.frac);
          const vars = {
            "--orb": orbitName(shape),
            "--orbl": labelName(shape),
            "--rx": `${rest.x.toFixed(2)}px`,
            "--ry": `${rest.y.toFixed(2)}px`,
            "--lo": labelVisible(shape, s.frac) ? 1 : 0,
            "--ex": `${s.cx - n.planet.cx}px`,
            "--ey": `${s.cy - n.planet.cy}px`,
            left: n.planet.cx - n.x - L.SAT_CELL_W / 2,
            top: n.planet.cy - n.y - L.SAT_D / 2,
            width: L.SAT_CELL_W,
            height: L.SAT_CELL_H,
          } as React.CSSProperties;
          return (
            <button
              key={s.key}
              type="button"
              inert={!open}
              data-node-key={s.key}
              data-node-kind={target ? "satellite" : "satMore"}
              data-target-key={target ?? n.key}
              // 펼친 위성 = 길게 눌러 다른 행성에 넣기(복사 — 이 행성에서는 안 빠짐, U3)
              data-drag={open && s.ref ? `${s.ref.kind === "person" ? "PERSON" : s.ref.kind === "place" ? "PLACE" : "PERSON_GROUP"}:${s.ref.id}` : undefined}
              data-drag-name={open && s.ref ? name : undefined}
              data-drag-from={open && s.ref ? n.key : undefined}
              data-frac={s.frac}
              data-pd={n.planet.d}
              data-tilt={s.orbit}
              aria-label={target ? C.space.satName(name, kind) : C.space.satMore(s.more)}
              className={`orbit-sat absolute flex flex-col items-center gap-1 rounded-md ${open ? "pointer-events-auto" : ""} ${FOCUS}`}
              style={vars}
            >
              <span
                aria-hidden
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold ${
                  kind === "place" ? "moon-place border-place" : "moon-person border-person"
                } ${kind === "group" ? "border-dashed" : ""}`}
                style={target && target === selected ? GLOW : undefined}
              >
                {!s.ref ? `+${s.more}` : kind === "place" ? <MapPin size={22} /> : kind === "group" ? <Users size={22} /> : name.slice(0, 1)}
              </span>
              {/* 공전 중 = 한 줄(행성 원판과 겹치는 구간은 숨김 — Q107) · 펼침 = 2줄. .orbit-lbl 은 위성 버튼의 바로 아래 자식(./orbit syncDelays 가 같은 지연을 붙임) */}
              {s.ref && (
                <span aria-hidden className={`orbit-lbl w-[104px] text-center text-lg leading-6 text-ink ${open ? "line-clamp-2" : "truncate"}`}>
                  {name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };
  // 행성 꾸미기(U4 — ./Decor) — 계 상자(.decor-sys)를 행성 버튼 앞에 두어 행성·위성 뒤에 그림. 화면 안 판정은 공전과 같은 관찰(./orbit).
  const decorSys = (n: Extract<LayoutNode, { kind: "event" | "story" }>, decor: string | null) =>
    decor ? (
      <div aria-hidden className="decor-sys pointer-events-none absolute" style={pos(n)} data-decor-of={n.key}>
        <DecorArt shape={decor} style={{ left: n.planet.cx - n.x - n.planet.d / 2, top: n.planet.cy - n.y - n.planet.d / 2, width: n.planet.d, height: n.planet.d }} />
      </div>
    ) : null;
  return (
    <>
      {layout.shapes.map((s) => (
        <div
          key={`shape:${s.groupId}`}
          aria-hidden
          data-group-id={s.groupId}
          className={`pointer-events-none absolute border-2 ${s.region === "places" ? "border-place bg-place-wash/60" : s.region === "custom" ? "border-music bg-music-wash/60" : "border-person bg-person-wash/60"}`}
          style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: shapeRadiusCss(s), borderStyle: GROUP_BORDER[s.index % GROUP_BORDER.length] }}
        />
      ))}
      <svg className="pointer-events-none absolute left-0 top-0" width={layout.width} height={layout.height} aria-hidden>
        {layout.trunk.map((t, i) => (
          <line
            key={`t${i}`}
            x1={L.RAIL_X}
            x2={L.RAIL_X}
            y1={t.y1}
            y2={t.y2}
            stroke={t.decade === null ? "var(--color-ink-faint)" : `var(--color-decade-strip-${t.decade})`}
            strokeWidth={6}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {layout.nodes.map((n) =>
        n.kind === "gap" ? (
          <div key={n.key} aria-hidden className="absolute flex items-center justify-center rounded-md border border-line bg-surface text-lg text-ink-soft" style={pos(n)}>
            {C.yearsLater(n.years)}
          </div>
        ) : null,
      )}

      <ol aria-label={C.mapListLabel} className="relative" style={{ zIndex: 2 }}>
        {data.events.map((ev) => {
          const en = byKey.get(`ev:${ev.id}`);
          if (!en || en.kind !== "event") return null;
          const fold = byKey.get(`fold:${ev.id}`);
          const open = !folded.has(ev.id);
          return (
            <li key={ev.id}>
              {decorSys(en, ev.decor)}
              <button
                type="button"
                data-node-key={en.key}
                data-node-kind="event"
                data-event-id={ev.id}
                data-decor={ev.decor ?? undefined}
                aria-label={eventAriaLabel(ev)}
                aria-current={current === ev.id ? "location" : undefined}
                className={`planet-period absolute flex flex-col items-center justify-center rounded-full px-3 text-center ${current === ev.id ? "border-[4px] border-ink" : "border-2 border-period-edge"} ${FOCUS}`}
                style={{ ...circle(en.planet), ...mark(en.key) }}
              >
                <span className="text-lg leading-6">{yearText(ev)}</span>
                <span className="line-clamp-2 text-xl font-bold leading-7">{ev.label}</span>
              </button>
              {satellites(en, ev.decor)}
              {fold && fold.kind === "fold" && (
                <button
                  type="button"
                  data-node-key={fold.key}
                  data-node-kind="fold"
                  data-event-id={ev.id}
                  aria-expanded={false}
                  className={buttonClasses("secondary", "lg", "absolute px-3")}
                  style={pos(fold)}
                >
                  {C.unfold(fold.count)}
                </button>
              )}
              {open && ev.stories.length > 0 && (
                <ul aria-label={C.listStories}>
                  {ev.stories.map((s) => {
                    const n = byKey.get(`st:${ev.id}:${s.id}`);
                    return n && n.kind === "story" ? (
                      <li key={s.id}>
                        {decorSys(n, s.decor)}
                        <StoryPlanet story={s} node={n} style={{ ...circle(n.planet), ...mark(n.key) }} />
                        {satellites(n, s.decor)}
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="mylife-people-title" className="relative" style={{ zIndex: 2 }}>
        {titleOf("people") && (
          <h2 id="mylife-people-title" className="absolute m-0 flex items-center" style={{ ...pos(titleOf("people")!), width: "auto", minWidth: titleOf("people")!.w }}>
            {/* 기본 카테고리 제목 = 버튼(누르면 이름 바꾸기 패널 — custom-graph 2단계 §6.6 P7) */}
            <button type="button" data-node-key="bcat:PEOPLE" data-node-kind="bcat" className={`flex min-h-[48px] items-center rounded-md px-1 text-[26px] hover:bg-banner ${FOCUS}`}>
              {builtinName(data, "PEOPLE")}
            </button>
          </h2>
        )}
        {regionAdd("people")}
        {chips.map((c) => {
          const g = idx.groupById.get(c.groupId);
          return (
            <button
              key={c.key}
              type="button"
              data-node-key={c.key}
              data-node-kind="groupChip"
              data-group-id={c.groupId}
              aria-label={C.groupChipName(g?.name ?? "", c.shown)}
              className={`absolute flex items-center justify-center gap-1 rounded-[10px] border-2 px-3 text-lg font-semibold ${c.shown ? "border-person bg-person-wash text-ink" : "border-line bg-surface text-ink-soft"} ${FOCUS}`}
              style={{ ...pos(c), ...mark(c.key) }}
            >
              <span className="truncate">{g?.name}</span>
              {c.shown && <span aria-hidden>{C.groupChipShown}</span>}
            </button>
          );
        })}
        {labels.map((l) => {
          const g = idx.groupById.get(l.groupId);
          return (
            <button
              key={l.key}
              type="button"
              data-node-key={l.key}
              data-node-kind="groupLabel"
              data-group-id={l.groupId}
              data-drag={`PERSON_GROUP:${l.groupId}`} // 길게 눌러 이야기·시기 행성에 넣기(U3)
              data-drag-name={g?.name ?? ""}
              aria-label={C.groupLabelName(g?.name ?? "", g?.memberIds.length ?? 0)}
              className={`absolute flex items-center gap-2 rounded-[10px] border-2 border-person bg-surface px-3 text-lg font-semibold text-ink hover:bg-banner ${FOCUS}`}
              style={{ ...pos(l), ...mark(l.key) }}
            >
              <Users aria-hidden size={20} className="shrink-0 text-person" />
              <span className="truncate">{g?.name}</span>
            </button>
          );
        })}
        {subOf("people") && (
          <p className="absolute m-0 flex items-center text-lg font-semibold text-ink-soft" style={pos(subOf("people")!)}>
            {C.noGroup}
          </p>
        )}
        {layout.shapes.filter((s) => s.region === "people" && (idx.groupById.get(s.groupId)?.memberIds.length ?? 0) === 0).map((s) => (
          <p key={`empty:${s.groupId}`} aria-hidden className="absolute m-0 flex items-center justify-center text-lg text-ink-soft" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
            {C.groupEmpty}
          </p>
        ))}
        <ul aria-label={C.peopleTitle}>
          {people.map((n) => {
            const p = idx.personById.get(n.personId);
            if (!p) return null;
            const groupNames = p.groupIds.map((g) => idx.groupById.get(g)?.name ?? "").filter(Boolean);
            return (
              <li key={n.key}>
                <button
                  type="button"
                  data-node-key={n.key}
                  data-node-kind="person"
                  data-group-ids={p.groupIds.join(",")}
                  data-drag={`PERSON:${p.id}`} // 길게 눌러 이야기·시기 행성에 넣기(U3)
                  data-drag-name={p.name}
                  aria-label={C.personName2(p.name, groupNames, idx.storiesOfPerson.get(p.id)?.length ?? 0)}
                  className={`absolute flex flex-col items-center gap-1.5 rounded-md pt-1 text-center ${FOCUS}`}
                  style={{ ...pos(n), ...mark(n.key) }}
                >
                  <span
                    aria-hidden
                    className="moon-person relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-person text-[22px] font-bold"
                    style={selected === n.key ? GLOW : undefined}
                  >
                    {p.name.slice(0, 1)}
                    {n.hiddenGroups > 0 && (
                      <span className="absolute -right-3 -top-2 rounded-full border-2 border-person bg-surface px-1.5 text-lg font-semibold leading-6 text-ink">
                        {C.otherGroups(n.hiddenGroups)}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 w-full text-lg leading-6 text-ink">{p.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="mylife-places-title" className="relative" style={{ zIndex: 2 }}>
        {titleOf("places") && (
          <h2 id="mylife-places-title" className="absolute m-0 flex items-center" style={{ ...pos(titleOf("places")!), width: "auto", minWidth: titleOf("places")!.w }}>
            <button type="button" data-node-key="bcat:PLACES" data-node-kind="bcat" className={`flex min-h-[48px] items-center rounded-md px-1 text-[26px] hover:bg-banner ${FOCUS}`}>
              {builtinName(data, "PLACES")}
            </button>
          </h2>
        )}
        {regionAdd("places")}
        {placeChips.map((c) => {
          const g = idx.placeGroupById.get(c.groupId);
          return (
            <button
              key={c.key}
              type="button"
              data-node-key={c.key}
              data-node-kind="groupChip"
              data-group-id={c.groupId}
              data-region="places"
              aria-label={C.placeGroupChipName(g?.name ?? "", c.shown)}
              className={`absolute flex items-center justify-center gap-1 rounded-[10px] border-2 px-3 text-lg font-semibold ${c.shown ? "border-place bg-place-wash text-ink" : "border-line bg-surface text-ink-soft"} ${FOCUS}`}
              style={{ ...pos(c), ...mark(c.key) }}
            >
              <span className="truncate">{g?.name}</span>
              {c.shown && <span aria-hidden>{C.groupChipShown}</span>}
            </button>
          );
        })}
        {placeLabels.map((l) => {
          const g = idx.placeGroupById.get(l.groupId);
          return (
            <button
              key={l.key}
              type="button"
              data-node-key={l.key}
              data-node-kind="groupLabel"
              data-group-id={l.groupId}
              data-region="places"
              aria-label={C.placeGroupLabelName(g?.name ?? "", g?.memberIds.length ?? 0)}
              className={`absolute flex items-center gap-2 rounded-[10px] border-2 border-place bg-surface px-3 text-lg font-semibold text-ink hover:bg-banner ${FOCUS}`}
              style={{ ...pos(l), ...mark(l.key) }}
            >
              <MapPin aria-hidden size={20} className="shrink-0 text-place" />
              <span className="truncate">{g?.name}</span>
            </button>
          );
        })}
        {subOf("places") && (
          <p className="absolute m-0 flex items-center text-lg font-semibold text-ink-soft" style={pos(subOf("places")!)}>
            {C.noPlaceGroup}
          </p>
        )}
        {layout.shapes.filter((s) => s.region === "places" && (idx.placeGroupById.get(s.groupId)?.memberIds.length ?? 0) === 0).map((s) => (
          <p key={`empty:${s.groupId}`} aria-hidden className="absolute m-0 flex items-center justify-center text-lg text-ink-soft" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
            {C.placeGroupEmpty}
          </p>
        ))}
        <ul aria-label={C.placesTitle}>
          {places.map((n) => {
            const p = idx.placeById.get(n.placeId);
            if (!p) return null;
            return (
              <li key={n.key}>
                <button
                  type="button"
                  data-node-key={n.key}
                  data-node-kind="place"
                  data-group-ids={p.groupIds.join(",")}
                  data-drag={`PLACE:${p.id}`} // 길게 눌러 이야기·시기 행성에 넣기(U3)
                  data-drag-name={p.name}
                  aria-label={C.placeName2(p.name, idx.storiesOfPlace.get(p.id)?.length ?? 0)}
                  className={`absolute flex flex-col items-center gap-1.5 rounded-md pt-1 text-center ${FOCUS}`}
                  style={{ ...pos(n), ...mark(n.key) }}
                >
                  <span
                    aria-hidden
                    className="moon-place flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-place"
                    style={selected === n.key ? GLOW : undefined}
                  >
                    <MapPin size={26} />
                  </span>
                  <span className="line-clamp-2 w-full text-lg leading-6 text-ink">{p.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <CategoryRegions data={data} layout={layout} selected={selected} mark={mark} glow={GLOW} />
    </>
  );
});

function tagText(s: MyLifeStory): string | null {
  const t = storyTag(s);
  if (t === "self") return C.selfTag;
  if (t === "elsewhere") return C.alsoElsewhereShort;
  return null;
}

function Chip({ chip }: { chip: Pick<MyLifeChip, "kind" | "name"> }) {
  return (
    <span
      className={`inline-block h-9 max-w-full truncate border-2 px-[9px] text-lg leading-8 text-ink ${CHIP_KIND[chip.kind]}`}
      style={{ borderRadius: "18px 18px 18px 4px" }}
    >
      {chip.name}
    </span>
  );
}

// 이야기 행성 — 지름 128 원 안에 꼬리표 한 줄(그때의 나·다른 시기에도) + 제목 2줄 말줄임(전체 제목은 패널·낭독 이름에 — Q106).
function StoryPlanet({ story, node, style }: { story: MyLifeStory; node: Extract<LayoutNode, { kind: "story" }>; style: React.CSSProperties }) {
  const tag = tagText(story);
  return (
    <button
      type="button"
      data-node-key={node.key}
      data-node-kind="story"
      data-event-id={node.eventId}
      data-decor={story.decor ?? undefined}
      aria-label={storyAriaLabel(story)}
      className={`planet-story absolute flex flex-col items-center justify-center rounded-full px-3 text-center ${story.kind === "SELF" ? "border-[3px] border-sage" : "border-2 border-planet-edge"} ${FOCUS}`}
      style={style}
    >
      {tag && <span className="line-clamp-1 text-lg leading-6">{tag}</span>}
      <span className="line-clamp-2 text-lg font-semibold leading-6">{shortTitle(displayTitle(story))}</span>
    </button>
  );
}


// ── 목록 보기(?view=list) — 같은 데이터·같은 패널, 절대 좌표·배율 없이 일반 흐름 ────────────

const LIST_ITEM = `flex min-h-[56px] w-full items-center gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left text-lg text-ink hover:bg-banner ${FOCUS}`;

function ListMode({
  data,
  idx,
  suggest,
  openPanel,
  onToggleView,
  onOpenFind,
  onCreate,
  status,
}: {
  data: MyLifeData;
  idx: Index;
  suggest: MyLifeSuggest;
  openPanel: (key: string, fromSat?: boolean, fromCat?: string | null) => void;
  onToggleView: () => void;
  onOpenFind: () => void;
  onCreate: (kind: CreateKind | null) => void;
  status: string | null;
}) {
  const ungrouped = data.people.filter((p) => p.groupIds.length === 0);
  const ungroupedPlaces = data.places.filter((p) => p.groupIds.length === 0);
  const addRow = (items: [CreateKind, string][]) => (
    <div className="flex gap-2">
      {items.map(([k, label]) => (
        <Button key={k} variant="secondary" size="lg" className="flex-1 px-3! sm:flex-none" aria-label={C.edit.regionAddName(label)} onClick={() => onCreate(k)}>
          <Plus aria-hidden size={20} className="shrink-0" />
          {label}
        </Button>
      ))}
    </div>
  );
  const placeButton = (p: MyLifePlace, listKey: string) => (
    <button type="button" data-list-key={listKey} data-node-key={`pl:${p.id}`} onClick={() => openPanel(`pl:${p.id}`)} className={`${LIST_ITEM} border-place`}>
      <MapPin aria-hidden size={20} className="shrink-0 text-place" />
      {p.name}
    </button>
  );
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 text-[28px]">{C.pageTitle}</h1>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="lg" className="px-4!" onClick={onOpenFind}>
            <Search aria-hidden size={20} className="shrink-0" />
            {C.find}
          </Button>
          <Button variant="secondary" size="lg" className="px-4!" onClick={onToggleView}>
            {C.toMap}
          </Button>
        </div>
      </div>
      {status && <p className="rounded-md border-2 border-brand bg-banner px-4 py-3 text-lg text-ink">{status}</p>}
      <div className="flex gap-2">
        <ButtonLink href="/chat-v3" variant="primary" size="lg" className="min-w-0 flex-1 px-3! sm:flex-none">
          <MessageCircle aria-hidden size={20} className="shrink-0" />
          {C.chatEntry}
        </ButtonLink>
        <Button variant="secondary" size="lg" className="shrink-0 px-4!" onClick={() => onCreate(null)}>
          <Plus aria-hidden size={20} className="shrink-0" />
          {C.edit.create}
        </Button>
      </div>
      {/* Q69 — /story-review 에서 옮긴 카드: 오늘의 인터뷰(항상) */}
      <InterviewEntryCard state={suggest.interview} />
      <ol aria-label={C.mapListLabel} className="flex flex-col gap-6">
        {data.events.map((ev) => (
          <li key={ev.id} className="flex flex-col gap-3">
            <button
              type="button"
              data-list-key={`ev:${ev.id}`}
              data-node-key={`ev:${ev.id}`}
              aria-label={eventAriaLabel(ev)}
              onClick={() => openPanel(`ev:${ev.id}`)}
              className={`flex min-h-[56px] w-full flex-col rounded-md border-[3px] border-action bg-banner px-5 py-3 text-left hover:bg-surface ${FOCUS}`}
            >
              <span className="text-lg text-ink-soft">{yearText(ev)}</span>
              <span className="text-[22px] font-bold leading-[30px] text-ink">{ev.label}</span>
            </button>
            {ev.stories.length > 0 && (
              <ul aria-label={C.listStories} className="ml-6 flex flex-col gap-2">
                {ev.stories.map((s) => {
                  const key = `st:${ev.id}:${s.id}`;
                  const tag = tagText(s);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        data-list-key={key}
                        data-node-key={key}
                        aria-label={storyAriaLabel(s)}
                        onClick={() => openPanel(key)}
                        className={`flex min-h-[56px] w-full flex-col gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left hover:bg-banner ${s.kind === "SELF" ? "border-sage" : "border-ink-soft"} ${FOCUS}`}
                      >
                        {tag && <span className="text-lg text-ink-soft">{tag}</span>}
                        <span className="text-lg text-ink">{shortTitle(displayTitle(s))}</span>
                        {s.chips.length > 0 && (
                          <span className="flex flex-wrap gap-1.5">
                            {s.chips.map((c, i) => (
                              <Chip key={i} chip={c} />
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <GapCards gaps={suggest.gaps} />

      {/* 인물록 — 모임별 묶음(여러 모임인 분은 각 모임에 나오고 꼬리표), 모임 없는 분 묶음. 간선 대신 패널의 "나온 이야기". */}
      <section aria-labelledby="mylife-list-people" className="flex flex-col gap-4">
        <h2 id="mylife-list-people" className="m-0">
          {C.peopleTitle}
        </h2>
        {addRow([["person", C.edit.regionAddPerson], ["group", C.edit.regionAddGroup]])}
        {data.groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <button type="button" data-list-key={`gl:${g.id}`} data-node-key={`gl:${g.id}`} onClick={() => openPanel(`gl:${g.id}`)} className={`${LIST_ITEM} border-person font-semibold`}>
              <Users aria-hidden size={20} className="shrink-0 text-person" />
              {g.name}
            </button>
            {g.memberIds.length === 0 ? (
              <p className="ml-6 text-lg text-ink-soft">{C.groupEmpty}</p>
            ) : (
              <ul aria-label={g.name} className="ml-6 flex flex-col gap-2">
                {g.memberIds.map((id) => {
                  const p = idx.personById.get(id);
                  if (!p) return null;
                  const others = p.groupIds.filter((x) => x !== g.id).map((x) => idx.groupById.get(x)?.name ?? "");
                  return (
                    <li key={id}>
                      <PersonRow person={p} listKey={`pe:${p.id}@${g.id}`} tag={others.length ? C.otherGroupsLong(others.length) : null} onOpen={() => openPanel(`pe:${p.id}`)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.groups.length > 0 && <h3 className="m-0 text-xl font-bold text-ink">{C.noGroup}</h3>}
            <ul aria-label={C.noGroup} className={`flex flex-col gap-2 ${data.groups.length > 0 ? "ml-6" : ""}`}>
              {ungrouped.map((p) => (
                <li key={p.id}>
                  <PersonRow person={p} listKey={`pe:${p.id}`} tag={null} onOpen={() => openPanel(`pe:${p.id}`)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="mylife-list-places" className="flex flex-col gap-4">
        <h2 id="mylife-list-places" className="m-0">
          {C.placesTitle}
        </h2>
        {addRow([["place", C.edit.regionAddPlace], ["placeGroup", C.edit.regionAddPlaceGroup]])}
        {/* 장소 묶음(3단계) — 묶음별(여러 묶음인 곳은 각 묶음에), 묶음 없는 곳 */}
        {data.placeGroups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <button type="button" data-list-key={`pgl:${g.id}`} data-node-key={`pgl:${g.id}`} onClick={() => openPanel(`pgl:${g.id}`)} className={`${LIST_ITEM} border-place font-semibold`}>
              <MapPin aria-hidden size={20} className="shrink-0 text-place" />
              {g.name}
            </button>
            {g.memberIds.length === 0 ? (
              <p className="ml-6 text-lg text-ink-soft">{C.placeGroupEmpty}</p>
            ) : (
              <ul aria-label={g.name} className="ml-6 flex flex-col gap-2">
                {g.memberIds.map((id) => {
                  const p = idx.placeById.get(id);
                  return p ? <li key={id}>{placeButton(p, `pl:${p.id}@${g.id}`)}</li> : null;
                })}
              </ul>
            )}
          </div>
        ))}
        {ungroupedPlaces.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.placeGroups.length > 0 && <h3 className="m-0 text-xl font-bold text-ink">{C.noPlaceGroup}</h3>}
            <ul aria-label={data.placeGroups.length > 0 ? C.noPlaceGroup : C.placesTitle} className={`flex flex-col gap-2 ${data.placeGroups.length > 0 ? "ml-6" : ""}`}>
              {ungroupedPlaces.map((p) => (
                <li key={p.id}>{placeButton(p, `pl:${p.id}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <CategoryListSections data={data} openPanel={openPanel} />
    </main>
  );
}

function PersonRow({ person, listKey, tag, onOpen }: { person: MyLifePerson; listKey: string; tag: string | null; onOpen: () => void }) {
  // 여러 모임인 분은 모임마다 나온다 — 목록 키는 모임별로 다르게, 검색 이동은 첫 번째(키 pe:id 또는 pe:id@첫 모임)로.
  return (
    <button type="button" data-list-key={listKey} onClick={onOpen} className={`${LIST_ITEM} border-person`}>
      <UserRound aria-hidden size={20} className="shrink-0 text-person" />
      <span>{person.name}</span>
      {person.relation && <span className="text-ink-soft">· {person.relation}</span>}
      {tag && <span className="ml-auto text-ink-soft">{tag}</span>}
    </button>
  );
}

// ── 찾기 ────────────────────────────────────────────────────────────

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  event: C.kindEvent,
  story: C.kindStory,
  person: C.kindPerson,
  place: C.kindPlace,
  group: C.kindGroup,
  placeGroup: C.kindPlaceGroup,
  category: C.custom.kindCategory,
  customGroup: C.custom.kindGroup,
  item: C.custom.kindItem,
};

function FindSheet({ data, onPick, onAsk, onClose }: { data: MyLifeData; onPick: (r: SearchResult) => void; onAsk: (q: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  const results = useMemo(() => searchMyLife(data, query), [data, query]);
  return (
    <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <h2 id="mylife-find-title" className="m-0">
        {C.findTitle}
      </h2>
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={C.findPlaceholder}
        aria-label={C.findTitle}
        className="min-h-[56px] w-full rounded-md border-2 border-line bg-surface px-4 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
      />
      <Button variant="secondary" size="lg" onClick={() => onAsk(q)}>
        {C.ask.open}
      </Button>
      {query.trim() !== "" && (
        <p className="text-lg text-ink-soft" aria-live="polite">
          {results.length === 0 ? C.findNone : C.findCount(results.length)}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onPick(r)} className={`flex min-h-[56px] w-full flex-col gap-1 rounded-md border-2 border-line bg-surface px-4 py-3 text-left text-lg text-ink hover:bg-banner ${FOCUS}`}>
              <span>
                <span className="text-ink-soft">{KIND_LABEL[r.kind]} · </span>
                {r.title}
              </span>
              {r.snippet && (
                <span className="text-ink-soft">
                  {r.snippet.before}
                  <strong className="font-bold text-ink">{r.snippet.match}</strong>
                  {r.snippet.after}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="tertiary" size="lg" onClick={onClose}>
        {C.close}
      </Button>
    </div>
  );
}

// ── 패널 — 정보(이 파일) + 고치기(./EditUI NodeEditor — 넣기·빼기·되돌리기·옮기기·지우기, 3단계) ──────────────

function GoRow({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-4 py-2 text-left text-lg text-ink hover:bg-banner ${FOCUS}`}>
        <span className="min-w-0">
          {sub && <span className="block text-ink-soft">{sub}</span>}
          <span className="block">{label}</span>
        </span>
        <span className="shrink-0 text-action">{C.goThere}</span>
      </button>
    </li>
  );
}

function PanelBody({
  nodeKey,
  data,
  idx,
  folded,
  showFold,
  onToggleFold,
  onGo,
  fromSat,
  notice,
  setNotice,
  links,
  startEdit,
  startPick,
  fromCategory,
  onReopen,
  onDeleted,
  related,
}: {
  nodeKey: string;
  data: MyLifeData;
  idx: Index;
  folded: Set<string>;
  showFold: boolean;
  onToggleFold: (eventId: string) => void;
  onGo: (key: string, eventId: string | null) => void;
  fromSat: boolean;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  links: OptLinks;
  startEdit: boolean; // 인물록 통합 — ?edit=1 로 연 사람 패널은 [이름·정보 고치기]로 시작
  startPick: boolean; // 카테고리 영역 [+ 넣기] — 넣기 고르기로 시작(custom-graph 2단계)
  fromCategory: string | null; // 바로가기로 연 원래 노드 패널 — 그 카테고리
  onReopen: (r: Created) => void;
  onDeleted: (name: string) => void;
  related: { count: number; go: () => void } | null;
}) {
  const info = panelInfo(nodeKey, data, idx, folded, showFold, onToggleFold, onGo, fromSat);
  if (!info) return null;
  return (
    <NodeEditor
      key={nodeKey}
      nodeKey={nodeKey}
      data={data}
      info={
        related ? (
          <>
            {info}
            <Button variant="secondary" size="lg" onClick={related.go}>
              {C.toRelated(related.count)}
            </Button>
          </>
        ) : (
          info
        )
      }
      notice={notice}
      setNotice={setNotice}
      links={links}
      startEdit={startEdit}
      startPick={startPick}
      fromCategory={fromCategory}
      onGo={onGo}
      onReopen={onReopen}
      onDeleted={onDeleted}
    />
  );
}

// 노드 정보(제목·기간·본문·나온 이야기). 이어진 사람·장소·모임 목록과 [빼기]·[넣기]는 NodeEditor 가 그린다.
function panelInfo(
  nodeKey: string,
  data: MyLifeData,
  idx: Index,
  folded: Set<string>,
  showFold: boolean,
  onToggleFold: (eventId: string) => void,
  onGo: (key: string, eventId: string | null) => void,
  fromSat: boolean, // 위성(바로가기)에서 연 사람·장소·모임 — [원래 자리로 가기](U2 §2.3)
): React.ReactNode | null {
  const [kind, a, b] = nodeKey.split(":");
  if (kind === "cat" || kind === "bcat" || kind === "cgl" || kind === "cgc" || kind === "cn") return customPanelInfo(nodeKey, data); // custom-graph 2단계

  if (kind === "ev") {
    const ev = idx.eventById.get(a);
    if (!ev) return null;
    const n = eventPeoplePlaces(ev);
    return (
      <>
        <p className="text-lg text-ink-soft">{yearText(ev)}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {ev.label}
        </h2>
        <p className="text-lg text-ink">
          {C.panelStories(ev.stories.length)} · {C.panelPeople(n.people)} · {C.panelPlaces(n.places)}
        </p>
        {showFold && ev.stories.length > 0 && (
          <Button variant="secondary" size="lg" aria-expanded={!folded.has(ev.id)} onClick={() => onToggleFold(ev.id)}>
            {folded.has(ev.id) ? C.unfold(ev.stories.length) : C.fold}
          </Button>
        )}
      </>
    );
  }

  if (kind === "st") {
    const ev = idx.eventById.get(a);
    const s = ev?.stories.find((x) => x.id === b);
    if (!ev || !s) return null;
    return <StoryPanel key={s.id} ev={ev} story={s} idx={idx} />;
  }

  if (kind === "pe") {
    const p = idx.personById.get(a);
    if (!p) return null;
    const stories = idx.storiesOfPerson.get(p.id) ?? [];
    const events = data.events.filter((e) => e.personIds.includes(p.id));
    return (
      <>
        <p className="text-lg text-ink-soft">{C.kindPerson}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {p.name}
        </h2>
        {/* 위성(바로가기)에서 열었으면 — 인물록의 이분 자리로(U2 §2.3) */}
        {fromSat && (
          <Button variant="secondary" size="lg" data-go-origin onClick={() => onGo(nodeKey, null)}>
            {C.space.goOrigin}
          </Button>
        )}
        {p.relation && (
          <p className="text-lg text-ink">
            {C.panelRelation}: {p.relation}
          </p>
        )}
        {p.metYear !== null && (
          <p className="text-lg text-ink">
            {C.panelMetYear}: {p.metYear}
          </p>
        )}
        {/* 인물록 통합(2026-11-06) — 옛 /people 칸, 값이 있을 때만 */}
        {p.birthYear !== null && (
          <p className="text-lg text-ink">
            {C.panelBirthYear}: {p.birthYear}
          </p>
        )}
        {p.memo && (
          <p className="whitespace-pre-line text-lg text-ink">
            {C.panelMemo}: {p.memo}
          </p>
        )}
        {/* 이 분에 대해 적은 글(인물 본문 — 2b-3c, 2026-11-03) */}
        {p.body && <p className="line-clamp-3 whitespace-pre-line text-lg text-ink">{p.body}</p>}
        <ButtonLink href={`/my-life/person/${p.id}/edit`} variant="secondary" size="lg">
          {p.body ? C.body.personEdit : C.body.personWrite}
        </ButtonLink>
        {stories.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelStoriesWith}</p>
            <ul className="flex flex-col gap-2">
              {stories.map(({ eventId, story }) => (
                <GoRow key={story.id} label={displayTitle(story)} sub={idx.eventById.get(eventId)?.label} onClick={() => onGo(`st:${eventId}:${story.id}`, eventId)} />
              ))}
            </ul>
          </div>
        )}
        {events.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelEventsWith}</p>
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <GoRow key={e.id} label={`${yearText(e)} ${e.label}`} onClick={() => onGo(`ev:${e.id}`, e.id)} />
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  if (kind === "pl") {
    const p = idx.placeById.get(a);
    if (!p) return null;
    const stories = idx.storiesOfPlace.get(p.id) ?? [];
    const events = data.events.filter((e) => e.placeIds.includes(p.id));
    return (
      <>
        <p className="text-lg text-ink-soft">{C.kindPlace}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {p.name}
        </h2>
        {fromSat && (
          <Button variant="secondary" size="lg" data-go-origin onClick={() => onGo(nodeKey, null)}>
            {C.space.goOrigin}
          </Button>
        )}
        {p.address && (
          <p className="text-lg text-ink">
            {C.panelAddress}: {p.address}
          </p>
        )}
        {stories.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelStoriesWith}</p>
            <ul className="flex flex-col gap-2">
              {stories.map(({ eventId, story }) => (
                <GoRow key={story.id} label={displayTitle(story)} sub={idx.eventById.get(eventId)?.label} onClick={() => onGo(`st:${eventId}:${story.id}`, eventId)} />
              ))}
            </ul>
          </div>
        )}
        {events.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelEventsWith}</p>
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <GoRow key={e.id} label={`${yearText(e)} ${e.label}`} onClick={() => onGo(`ev:${e.id}`, e.id)} />
              ))}
            </ul>
          </div>
        )}
        <a href={placeMapHref(p)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "lg")}>
          {C.openMap} ↗
        </a>
      </>
    );
  }

  if (kind === "gl" || kind === "gc") {
    const g = idx.groupById.get(a);
    if (!g) return null;
    return (
      <>
        <p className="text-lg text-ink-soft">{C.kindGroup}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {g.name}
        </h2>
        {fromSat && (
          <Button variant="secondary" size="lg" data-go-origin onClick={() => onGo(nodeKey, null)}>
            {C.space.goOrigin}
          </Button>
        )}
        {g.memberIds.length === 0 && <p className="text-lg text-ink-soft">{C.groupEmpty}</p>}
      </>
    );
  }

  if (kind === "pgl" || kind === "pgc") {
    const g = idx.placeGroupById.get(a);
    if (!g) return null;
    return (
      <>
        <p className="text-lg text-ink-soft">{C.kindPlaceGroup}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {g.name}
        </h2>
        {g.memberIds.length === 0 && <p className="text-lg text-ink-soft">{C.placeGroupEmpty}</p>}
      </>
    );
  }
  return null;
}

// 이야기 정보 — 함께 나온 분·나온 곳 목록(과 [빼기])은 NodeEditor 가 그린다. 확인 대기 분은 여기(작은 물방울 + 확인하러 가기).
// [이야기 고치기](Q69 — /story-review 이야기 카드에서 옮김): 본문 칸 + [저장]/[취소], 같은 서버 액션(updateEpisodeContentAction —
// 다듬은 글 초기화·제목은 그대로). 저장하면 바로 보이고(로컬) 지도 데이터는 router.refresh 로 다시 읽는다.
// [본문 보기] = 이야기 상세(/my-life/story/[id] — 2b-3c, 2026-11-03). 소제목·사진이 있는 글은 평문 칸 대신 글 고치기 화면으로
// (평문으로 고치면 그 자리가 사라지므로 — node-graph-self §2b.2 표시 규칙 3).
// 충돌(2026-11-04): 패널이 읽은 글(버전·평문)과 지금이 다르면 덮지 않고 고치던 글을 이전 판 "저장되지 않은 글"로 — 글 고치기
// 화면과 같은 처리·같은 문구·같은 [다시 불러오기](ConflictReload). base 는 저장에 성공하면 그 글로 바뀐다.
function StoryPanel({ ev, story, idx }: { ev: MyLifeEvent; story: MyLifeStory; idx: Index }) {
  const router = useRouter();
  const [body, setBody] = useState(story.content);
  const [base, setBase] = useState({ version: story.bodyVersion, content: story.content });
  const [draft, setDraft] = useState<string | null>(null); // null = 보기, 문자열 = 고치는 중
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ kept: boolean } | null>(null);
  const [saving, startSave] = useTransition();
  function save(text: string) {
    setError(null);
    setConflict(null);
    startSave(async () => {
      try {
        const r = await updateEpisodeContentAction(story.id, text, base);
        if (!r.ok) {
          if ("conflict" in r) {
            setConflict({ kept: r.kept });
            setError(r.kept ? C.body.errConflict : C.body.errConflictOnly);
            return;
          }
          setError(r.error ?? C.editBodyFailed);
          return;
        }
        setBody(text);
        setBase({ version: r.version, content: text.trim() });
        setDraft(null);
        router.refresh();
      } catch (e) {
        // 응답만 실패하고 저장은 끝났을 수 있다(P20-1) — 화면을 서버 상태로 맞춘다.
        console.error("[mylife-body]", e);
        setError(C.editBodyRetry);
        router.refresh();
      }
    });
  }
  const others = story.otherEventIds.map((id) => idx.eventById.get(id)).filter((e): e is MyLifeEvent => !!e);
  return (
    <>
      <p className="text-lg text-ink-soft">
        {story.kind === "SELF" ? `${C.selfTag} · ` : ""}
        {yearText(ev)} {ev.label}
      </p>
      {/* 제목이 비면 화면의 제목 줄은 생략 — 제목 대신 본문 첫 문장이 바로 아래 본문과 두 번 보이던 것(2026-11-02 E2E). 화면 낭독용으로만 남김. */}
      <h2 id="mylife-panel-title" className={hasOwnTitle(story) ? "m-0 text-2xl" : "sr-only"}>
        {hasOwnTitle(story) ? displayTitle(story) : shortTitle(displayTitle(story))}
      </h2>
      {draft === null ? (
        <>
          <p className="line-clamp-3 whitespace-pre-line text-lg text-ink">{body}</p>
          <ButtonLink href={`/my-life/story/${story.id}`} variant="secondary" size="lg">
            {C.readBody}
          </ButtonLink>
          {story.richBody ? (
            <>
              <p className="m-0 text-lg text-ink-soft">{C.body.richNote}</p>
              <ButtonLink href={`/my-life/story/${story.id}/edit`} variant="secondary" size="lg">
                {C.editBody}
              </ButtonLink>
            </>
          ) : (
            <Button variant="secondary" size="lg" onClick={() => setDraft(body)}>
              {C.editBody}
            </Button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            aria-label={C.bodyLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            disabled={saving}
            className="w-full rounded-md border-2 border-line bg-canvas px-4 py-3 text-lg leading-relaxed text-ink focus:border-brand focus:outline-none disabled:opacity-50"
          />
          {error && (
            <p role="alert" className="m-0 text-lg text-danger">
              {error}
            </p>
          )}
          {conflict && <ConflictReload kept={conflict.kept} />}
          <Button variant="primary" size="lg" disabled={saving || !draft.trim()} onClick={() => save(draft)}>
            {saving ? C.savingBody : C.saveBody}
          </Button>
          <Button
            variant="tertiary"
            size="lg"
            disabled={saving}
            onClick={() => {
              setDraft(null);
              setError(null);
              setConflict(null);
            }}
          >
            {C.edit.cancel}
          </Button>
        </div>
      )}
      {others.length > 0 && (
        <p className="text-lg text-ink">
          {C.panelAlsoIn(others.map((o) => `${yearText(o)} ${o.label}`).join(", "))}
        </p>
      )}
    </>
  );
}
