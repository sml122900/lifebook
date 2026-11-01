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

import { MapPin, MessageCircle, Minus, Plus, Search, UserRound, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import type { MyLifeChip, MyLifeData, MyLifeEvent, MyLifeGroup, MyLifePerson, MyLifePlace, MyLifeStory } from "@/lib/my-life";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import { selectionEdges, type EdgeToggles } from "@/lib/my-life-edges";
import { shapeRadiusCss } from "@/lib/my-life-group-shape";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  countTimelineNodes,
  layoutMyLife,
  overflowLabel,
  storyLead,
  storyText,
  storyTag,
  type LayoutNode,
  type MyLifeLayout,
} from "@/lib/my-life-layout";
import { searchMyLife, type SearchResult } from "@/lib/my-life-search";

const MAX_SCALE = 3;
const MIN_SCALE = 0.5; // 지도 전체가 이보다 작아야 들어가면 그 배율까지 내려간다
const ZOOM_STEP = 0.25;
const TAP_SLOP = 8; // 이만큼(px) 넘게 움직이면 탭이 아니라 끌기
const KEEP_VISIBLE = 120; // 움직임이 멈췄을 때 지도가 화면에 최소 이만큼(px) 남게 — 지도를 잃지 않게
const DOUBLE_TAP_MS = 350; // 어르신 손 — 라이브러리 기본(200ms)보다 넉넉하게
const DOUBLE_TAP_SCALE = 1.6;
const OVERVIEW_SCALE = 0.6; // 이 배율 미만 = 전체 보기 상태(노드 탭 = 그 노드로 확대 — Q60)
const STORE_KEY = "mylife:v3";

type Saved = { scale: number; x: number; y: number; folded: string[]; shownGroups: string[]; edges: EdgeToggles };

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

function yearText(ev: MyLifeEvent): string {
  if (ev.year === null) return C.yearUnknown;
  return ev.endYear !== null && ev.endYear !== ev.year ? `${ev.year}~${ev.endYear}` : `${ev.year}`;
}

function eventAriaLabel(ev: MyLifeEvent): string {
  const y = ev.year === null ? C.yearUnknown : `${yearText(ev)}년`;
  return C.eventName(y, ev.label, ev.stories.length, ev.personIds.length + ev.placeIds.length);
}

function storyAriaLabel(s: MyLifeStory): string {
  const names = s.chips.map((c) => (c.proposed ? `${c.name}(${C.pendingTag})` : c.name));
  return s.kind === "SELF" ? C.selfName(storyText(s), names) : C.storyName(storyText(s), names);
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
  person: "border-emerald-700 bg-emerald-50",
  group: "border-emerald-700 bg-emerald-50",
  place: "border-sky-700 bg-sky-50",
};
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
        if (!c.id) continue;
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
    storiesOfPerson,
    storiesOfPlace,
  };
}

function nodeName(key: string, data: MyLifeData, idx: Index): string {
  const [kind, a, b] = key.split(":");
  if (kind === "ev") return idx.eventById.get(a)?.label ?? "";
  if (kind === "st") {
    const s = idx.eventById.get(a)?.stories.find((x) => x.id === b);
    return s ? storyText(s) : "";
  }
  if (kind === "pe") return idx.personById.get(a)?.name ?? "";
  if (kind === "pl") return idx.placeById.get(a)?.name ?? "";
  if (kind === "gl" || kind === "gc") return idx.groupById.get(a)?.name ?? "";
  void data;
  return "";
}

// ── 화면 ────────────────────────────────────────────────────────────

export function MyLifeView({ data }: { data: MyLifeData }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "map";
  // ?focus=<노드 키> — /chat-v3 에서 방금 만든 이야기로 바로 가기(My Life 개편 2단계). 처음 그릴 때 한 번 —
  // 그 띠는 펼치고, 선택 + 지도 이동(MapMode 의 focusRequest 이펙트가 준비된 뒤 옮긴다).
  const [initialFocus] = useState(() => {
    const key = searchParams.get("focus");
    if (!key || !/^(ev|st|pe|pl|gl):/.test(key)) return null;
    const eventId = key.startsWith("st:") || key.startsWith("ev:") ? key.split(":")[1] : null;
    if (eventId && !data.events.some((e) => e.id === eventId)) return null;
    return { key, eventId };
  });
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
  const [edgesOn, setEdgesOn] = useState<EdgeToggles>({ person: true, place: true });
  const [selected, setSelected] = useState<string | null>(initialFocus?.key ?? null);
  const [panel, setPanel] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ key: string; n: number } | null>(
    initialFocus ? { key: initialFocus.key, n: 1 } : null,
  );
  const lastKeyRef = useRef<string | null>(null);
  const openedAtRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const findRef = useRef<HTMLDialogElement>(null);

  const layout = useMemo(() => layoutMyLife(data, { folded, shownGroupIds: shownGroups }), [data, folded, shownGroups]);
  const idx = useMemo(() => buildIndex(data), [data]);

  const openPanel = useCallback((key: string) => {
    lastKeyRef.current = key;
    setSelected(key);
    setPanel(key);
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (panel && !d.open) {
      openedAtRef.current = Date.now();
      d.showModal();
    }
    if (!panel && d.open) d.close();
  }, [panel]);

  useEffect(() => {
    const d = findRef.current;
    if (!d) return;
    if (findOpen && !d.open) d.showModal();
    if (!findOpen && d.open) d.close();
  }, [findOpen]);

  function onDialogClose() {
    setPanel(null);
    const key = lastKeyRef.current;
    if (key) document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  function toggleView() {
    setPanel(null);
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
  const goTo = useCallback(
    (key: string, eventId: string | null) => {
      setPanel(null);
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
      // 모임 이름이 영역에 없으면(4개 이상 — 숨은 모임) 칩으로
      const target = key.startsWith("gl:") && !layout.nodes.some((n) => n.key === key) ? `gc:${key.slice(3)}` : key;
      setSelected(target);
      setFocusRequest((r) => ({ key: target, n: (r?.n ?? 0) + 1 }));
    },
    [view, layout],
  );

  return (
    <>
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
          edgesOn={edgesOn}
          setEdgesOn={setEdgesOn}
          selected={selected}
          setSelected={setSelected}
          openPanel={openPanel}
          onToggleView={toggleView}
          onOpenFind={() => setFindOpen(true)}
          focusRequest={focusRequest}
        />
      ) : (
        <ListMode data={data} idx={idx} openPanel={openPanel} onToggleView={toggleView} onOpenFind={() => setFindOpen(true)} />
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="mylife-panel-title"
        onClose={onDialogClose}
        onClick={(e) => {
          if (e.target === dialogRef.current && Date.now() - openedAtRef.current > 400) dialogRef.current.close();
        }}
        className={`inset-x-0 bottom-0 top-auto mx-auto mb-0 w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-ink/40 ${view === "map" ? "max-h-[50dvh]" : "max-h-[75dvh]"}`}
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
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        {findOpen && <FindSheet data={data} onPick={(r) => goTo(r.key, r.eventId)} onClose={() => findRef.current?.close()} />}
      </dialog>
    </>
  );
}

// ── 지도(자유 이동 캔버스) ──────────────────────────────────────────────

type Init = { scale: number; x: number; y: number };
type Dir = "left" | "right" | "up" | "down";
type Offscreen = { people: Dir | null; places: Dir | null; timeline: Dir | null; related: { dir: Dir; count: number } | null };

const fitScaleOf = (w: number, h: number, layout: MyLifeLayout) => Math.min(w / layout.width, h / layout.height);

function dirOf(view: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }): Dir | null {
  const visible = r.x < view.x + view.w && r.x + r.w > view.x && r.y < view.y + view.h && r.y + r.h > view.y;
  if (visible) return null;
  const dx = r.x + r.w / 2 - (view.x + view.w / 2);
  const dy = r.y + r.h / 2 - (view.y + view.h / 2);
  if (r.x >= view.x + view.w || r.x + r.w <= view.x) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

function MapMode({
  data,
  idx,
  layout,
  folded,
  setFolded,
  toggleFold,
  shownGroups,
  setShownGroups,
  edgesOn,
  setEdgesOn,
  selected,
  setSelected,
  openPanel,
  onToggleView,
  onOpenFind,
  focusRequest,
}: {
  data: MyLifeData;
  idx: Index;
  layout: MyLifeLayout;
  folded: Set<string>;
  setFolded: (s: Set<string>) => void;
  toggleFold: (eventId: string) => void;
  shownGroups: string[];
  setShownGroups: (g: string[]) => void;
  edgesOn: EdgeToggles;
  setEdgesOn: (e: EdgeToggles) => void;
  selected: string | null;
  setSelected: (k: string | null) => void;
  openPanel: (key: string) => void;
  onToggleView: () => void;
  onOpenFind: () => void;
  focusRequest: { key: string; n: number } | null;
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
  const [area, setArea] = useState<"timeline" | "people" | "places">("timeline");
  const [scale, setScale] = useState(1);
  const [announce, setAnnounce] = useState("");
  const [offscreen, setOffscreen] = useState<Offscreen>({ people: null, places: null, timeline: null, related: null });

  const { edges, related } = useMemo(() => selectionEdges(data, layout, selected, edgesOn), [data, layout, selected, edgesOn]);

  // 콜백이 읽는 최신 값(렌더 중에는 읽지도 쓰지도 않는다).
  const layoutRef = useRef(layout);
  const savedRef = useRef({ folded, shownGroups, edgesOn });
  const relatedRef = useRef<{ selected: string | null; related: Set<string> }>({ selected, related });
  const stateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const initDoneRef = useRef(false);
  const restoreRef = useRef<Saved | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    savedRef.current = { folded, shownGroups, edgesOn };
    relatedRef.current = { selected, related };
  }, [layout, folded, shownGroups, edgesOn, selected, related]);

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
        setEdgesOn(saved.edges);
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
    writeSaved({ scale: st.scale, x: st.positionX, y: st.positionY, folded: [...v.folded], shownGroups: v.shownGroups, edges: v.edgesOn });
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

  // 화면 밖 영역·연결 대상 — 가장자리 버튼(지도 좌표로 계산, DOM 측정 없음).
  const updateOffscreen = useCallback(() => {
    const b = boxRef.current;
    if (!b) return;
    const s = stateRef.current;
    const lay = layoutRef.current;
    const view = { x: -s.positionX / s.scale, y: -s.positionY / s.scale, w: b.clientWidth / s.scale, h: b.clientHeight / s.scale };
    const r = relatedRef.current;
    let rel: Offscreen["related"] = null;
    if (r.selected && r.related.size > 0) {
      const counts: Record<Dir, number> = { left: 0, right: 0, up: 0, down: 0 };
      let n = 0;
      for (const k of r.related) {
        const node = lay.nodes.find((x) => x.key === k);
        const d = node ? dirOf(view, node) : null;
        if (d) {
          counts[d]++;
          n++;
        }
      }
      if (n > 0) rel = { dir: (Object.keys(counts) as Dir[]).sort((a, c) => counts[c] - counts[a])[0], count: n };
    }
    const next: Offscreen = {
      people: lay.regions.people.h > 0 ? dirOf(view, lay.regions.people) : null,
      places: lay.regions.places.h > 0 ? dirOf(view, lay.regions.places) : null,
      timeline: dirOf(view, lay.regions.timeline),
      related: rel,
    };
    setOffscreen((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    if (ready) save();
  }, [ready, folded, shownGroups, edgesOn, save]);

  useEffect(() => {
    if (ready) requestAnimationFrame(updateOffscreen);
  }, [ready, layout, selected, related, updateOffscreen]);

  // 매 프레임 — "지금 보는 곳"·배율 표시·화면 밖 버튼은 다음 프레임에 한 번만 갱신.
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
        setArea(cx < lay.regions.people.x ? "timeline" : cy < lay.regions.places.y ? "people" : "places");
        setCurrent(bandAt(lay, cy)?.eventId ?? null);
        setScale(s.scale);
        updateOffscreen();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          keepInView();
          save();
        }, 250);
      });
    },
    [save, keepInView, updateOffscreen],
  );

  // 검색 결과·"여기로 가기" — 노드를 화면 가운데·배율 1 이상으로(접힌 띠는 부모가 이미 펼침 → 다음 그림에서).
  useEffect(() => {
    if (!focusRequest || !ready) return;
    const el = boxRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(focusRequest.key)}"]`);
    if (!el) return;
    apiRef.current?.zoomToElement(el, Math.max(stateRef.current.scale, 1), 300);
    // 검색 시트·패널(<dialog>)이 닫히며 포커스를 연 버튼으로 되돌리므로, 그 뒤에 노드로 옮긴다.
    const t = setTimeout(() => el.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [focusRequest, layout, ready]);

  const fitAll = useCallback(() => {
    const api = apiRef.current;
    const b = boxRef.current;
    if (!api || !b) return;
    const s = Math.min(fitScaleOf(b.clientWidth, b.clientHeight, layoutRef.current), MAX_SCALE);
    api.setTransform((b.clientWidth - layoutRef.current.width * s) / 2, Math.max(0, (b.clientHeight - layoutRef.current.height * s) / 2), s, 250);
    setAnnounce(C.zoomAnnounce(Math.round(s * 100)));
  }, []);

  // 가장자리 버튼 — 인물록·장소록은 그 영역 제목이 화면 왼쪽 위에 오게, 시간 줄기는 줄기가 가운데 오게(높이 유지).
  // 전체 보기 배율(0.6 미만)에서 누르면 배율 1 로.
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
  // 그래서 선택 노드 → 연결 노드를 지도 순서대로 하나씩, 배율 1 이상으로(누를 때마다 다음 곳).
  const relCursor = useRef(0);
  function goRelated() {
    const keys = [selected, ...layoutRef.current.nodes.map((n) => n.key).filter((k) => related.has(k))].filter((k): k is string => !!k);
    if (keys.length === 0) return;
    relCursor.current = (relCursor.current + 1) % keys.length;
    const el = boxRef.current?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(keys[relCursor.current])}"]`);
    if (el) apiRef.current?.zoomToElement(el, Math.max(stateRef.current.scale, 1), 300);
  }

  // 노드 탭과 끌기 구분 — 누른 자리에서 8px 넘게 움직였으면 끌기(패널 안 염).
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY };
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
    const d = downRef.current;
    if (e.detail > 0 && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]");
    if (!el) return;
    const { nodeKey, nodeKind, eventId, groupId } = el.dataset;
    if (!nodeKey) return;
    // 전체 보기 상태 — 패널 대신 그 노드로 확대(Q60).
    if (stateRef.current.scale < OVERVIEW_SCALE) {
      apiRef.current?.zoomToElement(el, 1, 300);
      return;
    }
    if (nodeKind === "fold" && eventId) toggleFold(eventId);
    else if (nodeKind === "groupChip" && groupId) {
      const shown = layoutRef.current.shownGroupIds;
      setShownGroups(shown.includes(groupId) ? shown.filter((g) => g !== groupId) : [groupId, ...shown].slice(0, L.MAX_SHOWN_GROUPS));
    } else openPanel(nodeKey);
  }

  // Tab 으로 화면 밖 노드에 포커스가 가면 — 감싼 상자가 브라우저 기본 스크롤로 어긋나지 않게 되돌리고,
  // 그 노드가 화면 안(여백 24)에 오도록 지도를 옮긴다.
  function onFocusIn(e: React.FocusEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (!el.dataset.nodeKey) return;
    const wrap = e.currentTarget;
    requestAnimationFrame(() => {
      wrap.scrollTop = 0;
      wrap.scrollLeft = 0;
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
  const nowText = area !== "timeline"
    ? C.nowViewing(area === "people" ? C.peopleTitle : C.placesTitle)
    : currentEvent
    ? C.nowViewing(currentEvent.year === null ? `${currentEvent.label}(${C.yearUnknown})` : `${yearText(currentEvent)} ${currentEvent.label}`)
    : C.nowViewingNone;

  return (
    <div ref={regionRef} className="flex flex-col" style={{ height: regionTop ? `calc(100dvh - ${regionTop}px)` : "calc(100dvh - 72px)", minHeight: 420 }}>
      <div className="flex items-center justify-between gap-2 px-6 pt-3">
        <h1 className="m-0 text-[28px]">{C.pageTitle}</h1>
        <div className="flex shrink-0 gap-2">
          <ButtonLink href="/chat-v3" variant="primary" size="lg" className="hidden! px-4! sm:inline-flex!">
            <MessageCircle aria-hidden size={20} className="shrink-0" />
            {C.chatEntry}
          </ButtonLink>
          <Button variant="secondary" size="lg" className="px-4!" onClick={onOpenFind}>
            <Search aria-hidden size={20} className="shrink-0" />
            {C.find}
          </Button>
          <Button variant="secondary" size="lg" className="px-4!" onClick={onToggleView}>
            {C.toList}
          </Button>
        </div>
      </div>
      {/* 기록 방법 1 — 채팅(My Life 개편 2단계). 390 에선 머리 줄에 자리가 없어 한 줄 아래 꽉 찬 버튼(sm 이상은 머리 줄 안). */}
      <div className="px-6 pt-2 sm:hidden">
        <ButtonLink href="/chat-v3" variant="primary" size="lg" className="w-full">
          <MessageCircle aria-hidden size={20} className="shrink-0" />
          {C.chatEntry}
        </ButtonLink>
      </div>
      {selected ? (
        <>
          <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
            <p className="min-w-0 truncate text-lg text-ink">{C.selectedLine(nodeName(selected, data, idx), related.size)}</p>
            <Button variant="secondary" size="lg" className="shrink-0 px-4!" onClick={() => setSelected(null)}>
              {C.clearSelection}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 px-6 pb-1">
            <Button variant="tertiary" size="lg" className="px-4!" aria-pressed={!edgesOn.person} onClick={() => setEdgesOn({ ...edgesOn, person: !edgesOn.person })}>
              {edgesOn.person ? C.edgePersonOff : C.edgePersonOn}
            </Button>
            <Button variant="tertiary" size="lg" className="px-4!" aria-pressed={!edgesOn.place} onClick={() => setEdgesOn({ ...edgesOn, place: !edgesOn.place })}>
              {edgesOn.place ? C.edgePlaceOff : C.edgePlaceOn}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
          <p className="min-w-0 truncate text-lg text-ink-soft">{nowText}</p>
          {anyFolded && (
            <Button variant="secondary" size="lg" className="shrink-0" onClick={() => setFolded(new Set())}>
              {C.unfoldAll}
            </Button>
          )}
        </div>
      )}

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden border-y border-line bg-canvas">
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
            onInit={(ref) => {
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
                  "aria-label": C.mapRegionLabel,
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
                <svg className="pointer-events-none absolute left-0 top-0" width={layout.width} height={layout.height} aria-hidden style={{ zIndex: 1 }}>
                  {edges.map((e) => (
                    <path
                      key={`${e.from}>${e.to}`}
                      data-edge={e.kind}
                      d={e.d}
                      fill="none"
                      stroke={e.kind === "person" ? "var(--color-emerald-700)" : "var(--color-sky-700)"}
                      strokeWidth={3}
                      strokeDasharray={e.kind === "place" ? "8 6" : undefined}
                    />
                  ))}
                </svg>
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
        <EdgeButtons offscreen={offscreen} onRegion={goRegion} onRelated={goRelated} />
      </div>

      <div className="flex items-center gap-2 bg-surface py-2 pl-4 pr-[104px]">
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
        <Button variant="secondary" size="lg" onClick={fitAll}>
          {C.fitAll}
        </Button>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}

const ARROW: Record<Dir, string> = { left: "←", right: "→", up: "↑", down: "↓" };

// 지도 가장자리 버튼 — 지도 좌표가 아니라 화면에 고정(56px·18px).
function EdgeButtons({
  offscreen,
  onRegion,
  onRelated,
}: {
  offscreen: Offscreen;
  onRegion: (w: "people" | "places" | "timeline") => void;
  onRelated: () => void;
}) {
  const items: { dir: Dir; label: string; onClick: () => void; key: string }[] = [];
  if (offscreen.related) items.push({ dir: offscreen.related.dir, label: C.toRelated(offscreen.related.count), onClick: onRelated, key: "rel" });
  if (offscreen.people) items.push({ dir: offscreen.people, label: C.toPeople, onClick: () => onRegion("people"), key: "people" });
  if (offscreen.places) items.push({ dir: offscreen.places, label: C.toPlaces, onClick: () => onRegion("places"), key: "places" });
  if (offscreen.timeline) items.push({ dir: offscreen.timeline, label: C.toTimeline, onClick: () => onRegion("timeline"), key: "timeline" });
  const at: Record<Dir, string> = {
    right: "right-2 top-1/2 -translate-y-1/2 flex-col items-end",
    left: "left-2 top-1/2 -translate-y-1/2 flex-col items-start",
    up: "top-2 left-1/2 -translate-x-1/2 flex-row",
    down: "bottom-2 left-1/2 -translate-x-1/2 flex-row",
  };
  return (
    <>
      {(Object.keys(at) as Dir[]).map((d) => {
        const list = items.filter((i) => i.dir === d);
        if (list.length === 0) return null;
        return (
          <div key={d} className={`pointer-events-none absolute z-10 flex gap-2 ${at[d]}`}>
            {list.map((i) => (
              <button key={i.key} type="button" onClick={i.onClick} className={buttonClasses("secondary", "lg", "pointer-events-auto px-4! shadow-sm")}>
                {d === "left" || d === "up" ? `${ARROW[d]} ${i.label}` : `${i.label} ${ARROW[d]}`}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

// 지도 안 내용 — 확대·이동은 바깥 transform 만 바뀌어 다시 그리지 않는다(memo). 선택·지금 보는 곳이 바뀔 때만.
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
  const pos = (n: LayoutNode) => ({ left: n.x, top: n.y, width: n.w, height: n.h });
  const mark = (key: string): React.CSSProperties => (key === selected ? SELECTED_OUTLINE : related.has(key) ? RELATED_OUTLINE : {});
  const people = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "person" }> => n.kind === "person");
  const places = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "place" }> => n.kind === "place");
  const labels = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "groupLabel" }> => n.kind === "groupLabel");
  const chips = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "groupChip" }> => n.kind === "groupChip");
  const titleOf = (r: "people" | "places") => byKey.get(`title:${r}`);
  const subOf = (r: "people" | "places") => byKey.get(`sub:${r}`);
  return (
    <>
      {layout.shapes.map((s) => (
        <div
          key={`shape:${s.groupId}`}
          aria-hidden
          data-group-id={s.groupId}
          className="pointer-events-none absolute border-2 border-emerald-700 bg-emerald-700/5"
          style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: shapeRadiusCss(s), borderStyle: GROUP_BORDER[s.index % GROUP_BORDER.length] }}
        />
      ))}
      <svg className="pointer-events-none absolute left-0 top-0" width={layout.width} height={layout.height} aria-hidden>
        {layout.trunk.map((t, i) => (
          <line
            key={`t${i}`}
            x1={L.TRUNK_X}
            x2={L.TRUNK_X}
            y1={t.y1}
            y2={t.y2}
            stroke={t.decade === null ? "var(--color-ink-faint)" : `var(--color-decade-strip-${t.decade})`}
            strokeWidth={4}
          />
        ))}
        {layout.edges.map((e, i) => (
          <line key={`e${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--color-brand)" strokeWidth={2} />
        ))}
      </svg>
      {layout.nodes.map((n) =>
        n.kind === "gap" ? (
          <div key={n.key} aria-hidden className="absolute flex items-center justify-center rounded-md border border-line bg-canvas text-lg text-ink-soft" style={pos(n)}>
            {C.yearsLater(n.years)}
          </div>
        ) : null,
      )}

      <ol aria-label={C.mapListLabel} className="relative" style={{ zIndex: 2 }}>
        {data.events.map((ev) => {
          const en = byKey.get(`ev:${ev.id}`);
          if (!en) return null;
          const fold = byKey.get(`fold:${ev.id}`);
          const open = !folded.has(ev.id);
          return (
            <li key={ev.id}>
              <button
                type="button"
                data-node-key={en.key}
                data-node-kind="event"
                data-event-id={ev.id}
                aria-label={eventAriaLabel(ev)}
                aria-current={current === ev.id ? "location" : undefined}
                className={`absolute flex flex-col items-center justify-center rounded-[50%] border-[3px] bg-banner px-9 py-3.5 text-center hover:bg-surface ${current === ev.id ? "border-ink" : "border-action"} ${FOCUS}`}
                style={{ ...pos(en), ...mark(en.key) }}
              >
                <span className="text-lg leading-[26px] text-ink-soft">{yearText(ev)}</span>
                <span className="line-clamp-2 text-[22px] font-bold leading-[28px] text-ink">{ev.label}</span>
              </button>
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
                        <StoryNode story={s} node={n} style={{ ...pos(n), ...mark(n.key) }} />
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
          <h2 id="mylife-people-title" className="absolute m-0 flex items-center text-[26px]" style={pos(titleOf("people")!)}>
            {C.peopleTitle}
          </h2>
        )}
        {chips.map((c) => {
          const g = idx.groupById.get(c.groupId);
          return (
            <button
              key={c.key}
              type="button"
              data-node-key={c.key}
              data-node-kind="groupChip"
              data-group-id={c.groupId}
              aria-pressed={c.shown}
              aria-label={C.groupChipName(g?.name ?? "", c.shown)}
              className={`absolute flex items-center justify-center gap-1 rounded-[10px] border-2 px-3 text-lg font-semibold ${c.shown ? "border-emerald-700 bg-emerald-50 text-ink" : "border-line bg-surface text-ink-soft"} ${FOCUS}`}
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
              aria-label={C.groupLabelName(g?.name ?? "", g?.memberIds.length ?? 0)}
              className={`absolute flex items-center gap-2 rounded-[10px] border-2 border-emerald-700 bg-surface px-3 text-lg font-semibold text-ink hover:bg-banner ${FOCUS}`}
              style={{ ...pos(l), ...mark(l.key) }}
            >
              <Users aria-hidden size={20} className="shrink-0 text-emerald-700" />
              <span className="truncate">{g?.name}</span>
            </button>
          );
        })}
        {subOf("people") && (
          <p className="absolute m-0 flex items-center text-lg font-semibold text-ink-soft" style={pos(subOf("people")!)}>
            {C.noGroup}
          </p>
        )}
        {layout.shapes.filter((s) => (idx.groupById.get(s.groupId)?.memberIds.length ?? 0) === 0).map((s) => (
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
                  data-group-ids={p.draft ? "" : p.groupIds.join(",")}
                  aria-label={`${C.personName2(p.name, groupNames, idx.storiesOfPerson.get(p.id)?.length ?? 0)}${p.draft ? `, ${C.pendingTag}` : ""}`}
                  className={`absolute flex items-center gap-2 border-2 border-emerald-700 bg-surface px-3 text-left text-lg text-ink hover:bg-banner ${p.draft ? "border-dashed" : ""} ${FOCUS}`}
                  style={{ ...pos(n), ...mark(n.key), borderRadius: "6px 28px 28px 28px" }}
                >
                  <UserRound aria-hidden size={20} className="shrink-0 text-emerald-700" />
                  <span className="min-w-0 truncate">{p.name}</span>
                  {p.draft && <span className="shrink-0 text-lg text-ink-soft">{C.pendingTag}</span>}
                  {n.hiddenGroups > 0 && <span className="ml-auto shrink-0 text-lg text-ink-soft">{C.otherGroups(n.hiddenGroups)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="mylife-places-title" className="relative" style={{ zIndex: 2 }}>
        {titleOf("places") && (
          <h2 id="mylife-places-title" className="absolute m-0 flex items-center text-[26px]" style={pos(titleOf("places")!)}>
            {C.placesTitle}
          </h2>
        )}
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
                  aria-label={C.placeName2(p.name, idx.storiesOfPlace.get(p.id)?.length ?? 0)}
                  className={`absolute flex items-center gap-2 border-2 border-sky-700 bg-surface px-3 text-left text-lg text-ink hover:bg-banner ${FOCUS}`}
                  style={{ ...pos(n), ...mark(n.key), borderRadius: "6px 28px 28px 28px" }}
                >
                  <MapPin aria-hidden size={20} className="shrink-0 text-sky-700" />
                  <span className="min-w-0 truncate">{p.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
});

function tagText(s: MyLifeStory): string | null {
  const t = storyTag(s);
  if (t === "self") return C.selfTag;
  if (t === "pending") return C.pendingTag;
  if (t === "elsewhere") return C.alsoElsewhereShort;
  return null;
}

function Chip({ chip }: { chip: Pick<MyLifeChip, "kind" | "name" | "proposed"> }) {
  return (
    <span
      className={`inline-block h-9 max-w-full truncate border-2 px-[9px] text-lg leading-8 text-ink ${CHIP_KIND[chip.kind]} ${chip.proposed ? "border-dashed" : ""}`}
      style={{ borderRadius: "18px 18px 18px 4px" }}
    >
      {chip.name}
    </span>
  );
}

function StoryNode({ story, node, style }: { story: MyLifeStory; node: Extract<LayoutNode, { kind: "story" }>; style: React.CSSProperties }) {
  const tag = tagText(story);
  const rows = node.chipRows.map((r) => r.map((i) => story.chips[i]));
  if (node.overflow > 0) {
    if (rows.length === 0) rows.push([]);
    rows[rows.length - 1].push({ kind: "person", id: null, name: overflowLabel(node.overflow), proposed: false });
  }
  return (
    <button
      type="button"
      data-node-key={node.key}
      data-node-kind="story"
      data-event-id={node.eventId}
      aria-label={storyAriaLabel(story)}
      className={`absolute flex flex-col overflow-hidden border-2 bg-surface px-[14px] py-3 text-left hover:bg-banner ${story.kind === "SELF" ? "border-sage" : "border-ink-soft"} ${FOCUS}`}
      style={{ ...style, borderRadius: "32px 6px 32px 32px" }}
    >
      {tag && <span className="block h-7 shrink-0 truncate text-lg leading-7 text-ink-soft">{tag}</span>}
      <span className="line-clamp-2 shrink-0 text-lg leading-[26px] text-ink">{storyText(story)}</span>
      {rows.length > 0 && (
        <span className="mt-2 flex shrink-0 flex-col gap-1.5">
          {rows.map((r, ri) => (
            <span key={ri} className="flex min-w-0 gap-1.5">
              {r.map((c, ci) => (
                <Chip key={ci} chip={c} />
              ))}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

// ── 목록 보기(?view=list) — 같은 데이터·같은 패널, 절대 좌표·배율 없이 일반 흐름 ────────────

const LIST_ITEM = `flex min-h-[56px] w-full items-center gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left text-lg text-ink hover:bg-banner ${FOCUS}`;

function ListMode({
  data,
  idx,
  openPanel,
  onToggleView,
  onOpenFind,
}: {
  data: MyLifeData;
  idx: Index;
  openPanel: (key: string) => void;
  onToggleView: () => void;
  onOpenFind: () => void;
}) {
  const ungrouped = data.people.filter((p) => p.groupIds.length === 0);
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
      <ButtonLink href="/chat-v3" variant="primary" size="lg" className="w-full sm:w-auto sm:self-start">
        <MessageCircle aria-hidden size={20} className="shrink-0" />
        {C.chatEntry}
      </ButtonLink>
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
                        <span className="text-lg text-ink">{storyText(s)}</span>
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

      {/* 인물록 — 모임별 묶음(여러 모임인 분은 각 모임에 나오고 꼬리표), 모임 없는 분 묶음. 간선 대신 패널의 "나온 이야기". */}
      <section aria-labelledby="mylife-list-people" className="flex flex-col gap-4">
        <h2 id="mylife-list-people" className="m-0">
          {C.peopleTitle}
        </h2>
        {data.groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <button type="button" data-list-key={`gl:${g.id}`} data-node-key={`gl:${g.id}`} onClick={() => openPanel(`gl:${g.id}`)} className={`${LIST_ITEM} border-emerald-700 font-semibold`}>
              <Users aria-hidden size={20} className="shrink-0 text-emerald-700" />
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
                  <PersonRow person={p} listKey={`pe:${p.id}`} tag={p.draft ? C.pendingTag : null} onOpen={() => openPanel(`pe:${p.id}`)} />
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
        <ul aria-label={C.placesTitle} className="flex flex-col gap-2">
          {data.places.map((p) => (
            <li key={p.id}>
              <button type="button" data-list-key={`pl:${p.id}`} data-node-key={`pl:${p.id}`} onClick={() => openPanel(`pl:${p.id}`)} className={`${LIST_ITEM} border-sky-700`}>
                <MapPin aria-hidden size={20} className="shrink-0 text-sky-700" />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PersonRow({ person, listKey, tag, onOpen }: { person: MyLifePerson; listKey: string; tag: string | null; onOpen: () => void }) {
  // 여러 모임인 분은 모임마다 나온다 — 목록 키는 모임별로 다르게, 검색 이동은 첫 번째(키 pe:id 또는 pe:id@첫 모임)로.
  return (
    <button type="button" data-list-key={listKey} onClick={onOpen} className={`${LIST_ITEM} border-emerald-700 ${person.draft ? "border-dashed" : ""}`}>
      <UserRound aria-hidden size={20} className="shrink-0 text-emerald-700" />
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
};

function FindSheet({ data, onPick, onClose }: { data: MyLifeData; onPick: (r: SearchResult) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  const results = useMemo(() => searchMyLife(data, query, storyLead), [data, query]);
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

// ── 패널(정보 보기만 — 넣기·빼기는 3단계) ──────────────────────────────

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
}: {
  nodeKey: string;
  data: MyLifeData;
  idx: Index;
  folded: Set<string>;
  showFold: boolean;
  onToggleFold: (eventId: string) => void;
  onGo: (key: string, eventId: string | null) => void;
}) {
  const [kind, a, b] = nodeKey.split(":");
  void data;

  if (kind === "ev") {
    const ev = idx.eventById.get(a);
    if (!ev) return null;
    const people = new Set<string>();
    const places = new Set<string>();
    for (const s of ev.stories) for (const c of s.chips) (c.kind === "place" ? places : people).add(`${c.kind}:${c.id ?? c.name}`);
    for (const id of ev.personIds) people.add(`person:${id}`);
    for (const id of ev.placeIds) places.add(`place:${id}`);
    return (
      <>
        <p className="text-lg text-ink-soft">{yearText(ev)}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {ev.label}
        </h2>
        <p className="text-lg text-ink">
          {C.panelStories(ev.stories.length)} · {C.panelPeople(people.size)} · {C.panelPlaces(places.size)}
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
    return <StoryPanel ev={ev} story={s} idx={idx} />;
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
        {p.groupIds.length > 0 && (
          <p className="text-lg text-ink">
            {C.panelGroups}: {p.groupIds.map((g) => idx.groupById.get(g)?.name).filter(Boolean).join(", ")}
          </p>
        )}
        {p.draft && (
          <div className="flex flex-col gap-3 rounded-md border-2 border-brand bg-banner p-4">
            <p className="text-lg text-ink">{C.draftNote}</p>
            <ButtonLink href="/story-review/confirm" variant="secondary" size="lg">
              {C.goConfirm}
            </ButtonLink>
          </div>
        )}
        {stories.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelStoriesWith}</p>
            <ul className="flex flex-col gap-2">
              {stories.map(({ eventId, story }) => (
                <GoRow key={story.id} label={storyText(story)} sub={idx.eventById.get(eventId)?.label} onClick={() => onGo(`st:${eventId}:${story.id}`, eventId)} />
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
        {!p.draft && (
          <ButtonLink href={`/people/${p.id}`} variant="secondary" size="lg">
            {C.openPerson}
          </ButtonLink>
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
                <GoRow key={story.id} label={storyText(story)} sub={idx.eventById.get(eventId)?.label} onClick={() => onGo(`st:${eventId}:${story.id}`, eventId)} />
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
        {g.memberIds.length === 0 ? (
          <p className="text-lg text-ink-soft">{C.groupEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{C.panelMembers}</p>
            <ul className="flex flex-col gap-2">
              {g.memberIds.map((id) => {
                const p = idx.personById.get(id);
                return p ? <GoRow key={id} label={p.name} sub={p.relation ?? undefined} onClick={() => onGo(`pe:${id}`, null)} /> : null;
              })}
            </ul>
          </div>
        )}
      </>
    );
  }
  return null;
}

function StoryPanel({ ev, story, idx }: { ev: MyLifeEvent; story: MyLifeStory; idx: Index }) {
  const [full, setFull] = useState(false);
  const people = story.chips.filter((c) => c.kind !== "place");
  const places = story.chips.filter((c) => c.kind === "place");
  const others = story.otherEventIds.map((id) => idx.eventById.get(id)).filter((e): e is MyLifeEvent => !!e);
  return (
    <>
      <p className="text-lg text-ink-soft">
        {story.kind === "SELF" ? `${C.selfTag} · ` : ""}
        {yearText(ev)} {ev.label}
      </p>
      <h2 id="mylife-panel-title" className="m-0 text-2xl">
        {storyText(story)}
      </h2>
      <p className={`whitespace-pre-line text-lg text-ink ${full ? "" : "line-clamp-3"}`}>{story.content}</p>
      <Button variant="secondary" size="lg" aria-expanded={full} onClick={() => setFull((v) => !v)}>
        {full ? C.hideBody : C.readBody}
      </Button>
      {people.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-ink">{C.panelWithPeople}</p>
          <p className="flex flex-wrap gap-1.5">
            {people.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <Chip chip={c} />
                {c.proposed && <span className="text-lg text-ink-soft">({C.pendingTag})</span>}
              </span>
            ))}
          </p>
        </div>
      )}
      {places.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-ink">{C.panelWithPlaces}</p>
          <p className="flex flex-wrap gap-1.5">
            {places.map((c, i) => (
              <Chip key={i} chip={c} />
            ))}
          </p>
        </div>
      )}
      {others.length > 0 && (
        <p className="text-lg text-ink">
          {C.panelAlsoIn}: {others.map((o) => `${yearText(o)} ${o.label}`).join(", ")}
        </p>
      )}
      {story.hasPending && (
        <div className="flex flex-col gap-3 rounded-md border-2 border-brand bg-banner p-4">
          <p className="text-lg text-ink">{C.pendingNote}</p>
          <ButtonLink href={`/story-review/confirm#${story.id}`} variant="secondary" size="lg">
            {C.goConfirm}
          </ButtonLink>
        </div>
      )}
    </>
  );
}
