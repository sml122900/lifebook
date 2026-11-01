"use client";

// My Life 마인드맵(2b-3a, 보기 전용) — docs/phase/node-graph-self.md §6 2b.1.
//
// 지도 = 자유 이동 캔버스(react-zoom-pan-pinch — 2026-11-01 운영 폰 피드백으로 Q42 교체 조건 충족). 끌기 = 이동,
//   두 손가락·휠·더블탭 = 그 지점 확대, [+][−] = 화면 가운데 기준, [전체 보기] = 지도 전체, 키보드 화살표 = 이동.
//   노드 크기·간격은 지도 좌표로 고정(lib/my-life-layout). 지도 화면에서는 페이지 스크롤을 잠근다.
// 지도 DOM 자체가 시기 순 목록(ol > li)이라 스크린리더는 목록으로 읽는다(위치만 절대 좌표).
// 노드를 누르면 아래 패널(<dialog> — 포커스 가두기·Esc·바깥 누르기). 이번 단계는 정보 보기만.

import { MapPin, Minus, Plus, UserRound, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import type { MyLifeBranch, MyLifeChip, MyLifeData, MyLifeEvent, MyLifeStory } from "@/lib/my-life";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  countMapNodes,
  layoutMyLife,
  overflowLabel,
  storyLead,
  storyTag,
  type LayoutNode,
  type MyLifeLayout,
} from "@/lib/my-life-layout";

const MAX_SCALE = 3;
const MIN_SCALE = 0.5; // 지도 전체가 이보다 작아야 들어가면 그 배율까지 내려간다
const KEEP_VISIBLE = 120; // 움직임이 멈췄을 때 지도가 화면에 최소 이만큼(px) 남게 — 지도를 잃지 않게
const DOUBLE_TAP_MS = 350; // 어르신 손 — 라이브러리 기본(200ms)보다 넉넉하게
const DOUBLE_TAP_SCALE = 1.6;
const ZOOM_STEP = 0.25;
const TAP_SLOP = 8; // 이만큼(px) 넘게 움직이면 탭이 아니라 끌기
const STORE_KEY = "mylife:v2";

type PanelTarget =
  | { kind: "event"; eventId: string }
  | { kind: "story"; eventId: string; storyId: string }
  | { kind: "branch"; eventId: string; index: number };

type Saved = { scale: number; x: number; y: number; folded: string[] };

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
    if (v && [v.scale, v.x, v.y].every((n) => typeof n === "number" && Number.isFinite(n)) && Array.isArray(v.folded)) return v;
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
  return C.eventName(y, ev.label, ev.stories.length, ev.branches.length);
}

function storyAriaLabel(s: MyLifeStory): string {
  const names = s.chips.map((c) => (c.proposed ? `${c.name}(${C.pendingTag})` : c.name));
  return s.kind === "SELF" ? C.selfName(storyLead(s.content), names) : C.storyName(storyLead(s.content), names);
}

function branchAriaLabel(b: MyLifeBranch): string {
  if (b.kind === "person") return C.personName(b.name);
  if (b.kind === "group") return C.groupName(b.name);
  return C.placeName(b.name);
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

// ── 화면 ────────────────────────────────────────────────────────────

export function MyLifeView({ data }: { data: MyLifeData }) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "map";
  const total = useMemo(() => countMapNodes(data), [data]);
  // 접기 기본값(Q41) — 노드가 많으면 전부 접힘. 같은 탭의 저장값은 지도가 열릴 때 덮는다.
  const [folded, setFolded] = useState<Set<string>>(
    () => new Set(total > FOLD_ALL_ABOVE ? data.events.filter((e) => e.stories.length + e.branches.length > 0).map((e) => e.id) : []),
  );
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const openedAtRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const eventById = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);

  const openPanel = useCallback((t: PanelTarget, key: string) => {
    lastKeyRef.current = key;
    setPanel(t);
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

  function onDialogClose() {
    setPanel(null);
    const key = lastKeyRef.current;
    if (key) document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  function toggleView() {
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

  return (
    <>
      {view === "map" ? (
        <MapMode
          data={data}
          folded={folded}
          setFolded={setFolded}
          toggleFold={toggleFold}
          openPanel={openPanel}
          onToggleView={toggleView}
        />
      ) : (
        <ListMode data={data} openPanel={openPanel} onToggleView={toggleView} />
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="mylife-panel-title"
        onClose={onDialogClose}
        onClick={(e) => {
          if (e.target === dialogRef.current && Date.now() - openedAtRef.current > 400) dialogRef.current.close();
        }}
        className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
          {panel && (
            <PanelBody
              target={panel}
              eventById={eventById}
              folded={folded}
              showFold={view === "map"}
              onToggleFold={(id) => {
                toggleFold(id);
                dialogRef.current?.close();
              }}
            />
          )}
          <Button variant="tertiary" size="lg" onClick={() => dialogRef.current?.close()}>
            {C.close}
          </Button>
        </div>
      </dialog>
    </>
  );
}

// ── 지도(자유 이동 캔버스) ──────────────────────────────────────────────

type Init = { scale: number; x: number; y: number };

// 지도 전체가 영역에 들어오는 배율.
const fitScaleOf = (w: number, h: number, layout: MyLifeLayout) => Math.min(w / layout.width, h / layout.height);

function MapMode({
  data,
  folded,
  setFolded,
  toggleFold,
  openPanel,
  onToggleView,
}: {
  data: MyLifeData;
  folded: Set<string>;
  setFolded: (s: Set<string>) => void;
  toggleFold: (eventId: string) => void;
  openPanel: (t: PanelTarget, key: string) => void;
  onToggleView: () => void;
}) {
  const layout = useMemo(() => layoutMyLife(data, { folded }), [data, folded]);
  const regionRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [regionTop, setRegionTop] = useState(0);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [init, setInit] = useState<Init | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string | null>(data.events[0]?.id ?? null);
  const [scale, setScale] = useState(1);
  const [announce, setAnnounce] = useState("");

  // 콜백이 읽는 최신 값(렌더 중에는 읽지도 쓰지도 않는다).
  const layoutRef = useRef(layout);
  const foldedRef = useRef(folded);
  const stateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const initDoneRef = useRef(false);
  const restoreRef = useRef<Saved | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    foldedRef.current = folded;
  }, [layout, folded]);

  // 페이지 자체 스크롤을 잠근다 — 지도 영역의 끌기·확대가 페이지 스크롤·브라우저 확대와 다투지 않게.
  // 머리·도구줄은 그대로 고정. 목록 보기로 바꾸거나 화면을 떠나면 원래대로.
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
      // 처음 화면(1회) — 첫 중심이 위쪽 가운데, 배율 1(넓은 화면 1.25 — 중심 글씨 22px·가지 18px 이상).
      // 같은 탭에서 돌아오면 마지막 위치·배율·접힘. 이후 data·접기가 바뀌어도 위치는 그대로.
      if (initDoneRef.current || h < 50) return;
      initDoneRef.current = true;
      // 라이브러리의 "처음 값"(키 0 = 처음 화면)은 언제나 첫 중심 위쪽 가운데 — 복원은 초기화 직후 이동으로.
      const base = w >= 768 ? 1.25 : 1;
      const first = layoutRef.current.bands[0];
      setInit({ scale: base, x: w / 2 - L.TRUNK_X * base, y: 16 - (first ? first.top : 0) * base });
      const saved = readSaved();
      if (saved) {
        restoreRef.current = saved;
        setFolded(new Set(saved.folded.filter((id) => data.events.some((e) => e.id === id))));
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
    writeSaved({ scale: st.scale, x: st.positionX, y: st.positionY, folded: [...foldedRef.current] });
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
  }, [ready, folded, save]);

  // 매 프레임 — "지금 보는 곳"(화면 가운데에 가까운 띠)·배율 표시는 다음 프레임에 한 번만 갱신.
  const onTransform = useCallback(
    (_ref: ReactZoomPanPinchRef, st: { scale: number; positionX: number; positionY: number }) => {
      stateRef.current = st;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const h = boxRef.current?.clientHeight ?? 0;
        const s = stateRef.current;
        const band = bandAt(layoutRef.current, (h / 2 - s.positionY) / s.scale);
        setCurrent(band?.eventId ?? null);
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

  const fitAll = useCallback(() => {
    const api = apiRef.current;
    const b = boxRef.current;
    if (!api || !b) return;
    const s = Math.min(fitScaleOf(b.clientWidth, b.clientHeight, layoutRef.current), MAX_SCALE);
    api.setTransform((b.clientWidth - layoutRef.current.width * s) / 2, Math.max(0, (b.clientHeight - layoutRef.current.height * s) / 2), s, 250);
    setAnnounce(C.zoomAnnounce(Math.round(s * 100)));
  }, []);

  // 노드 탭과 끌기 구분 — 누른 자리에서 8px 넘게 움직였으면 끌기(패널 안 염).
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY };
  }

  // 빈 곳 더블탭(마우스 더블클릭 포함) = 그 지점 확대. 노드 위는 제외(노드 탭 = 패널).
  function onPointerUp(e: React.PointerEvent) {
    const d = downRef.current;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    if ((e.target as HTMLElement).closest("[data-node-key]")) {
      lastTapRef.current = null;
      return;
    }
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

  function onWorldClick(e: React.MouseEvent) {
    const d = downRef.current;
    if (e.detail > 0 && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]");
    if (!el) return;
    const { nodeKey, nodeKind, eventId, storyId, branchIndex } = el.dataset;
    if (!nodeKey || !eventId) return;
    if (nodeKind === "fold") toggleFold(eventId);
    else if (nodeKind === "event") openPanel({ kind: "event", eventId }, nodeKey);
    else if (nodeKind === "story" && storyId) openPanel({ kind: "story", eventId, storyId }, nodeKey);
    else if (nodeKind === "branch" && branchIndex) openPanel({ kind: "branch", eventId, index: Number(branchIndex) }, nodeKey);
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
  const nowText = currentEvent
    ? C.nowViewing(currentEvent.year === null ? `${currentEvent.label}(${C.yearUnknown})` : `${yearText(currentEvent)} ${currentEvent.label}`)
    : C.nowViewingNone;

  return (
    <div ref={regionRef} className="flex flex-col" style={{ height: regionTop ? `calc(100dvh - ${regionTop}px)` : "calc(100dvh - 72px)", minHeight: 420 }}>
      <div className="flex items-center justify-between gap-3 px-6 pt-3">
        <h1 className="m-0">{C.pageTitle}</h1>
        <Button variant="secondary" size="lg" onClick={onToggleView}>
          {C.toList}
        </Button>
      </div>
      <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
        <p className="min-w-0 truncate text-lg text-ink-soft">{nowText}</p>
        {anyFolded && (
          <Button variant="secondary" size="lg" className="shrink-0" onClick={() => setFolded(new Set())}>
            {C.unfoldAll}
          </Button>
        )}
      </div>

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
              wrapperProps={{
                role: "region",
                "aria-label": C.mapRegionLabel,
                "data-ready": ready ? "1" : undefined,
                onPointerDown,
                onPointerUp,
                onFocus: onFocusIn,
              } as React.HTMLAttributes<HTMLDivElement>}
            >
              <div className="relative" style={{ width: layout.width, height: layout.height }} onClick={onWorldClick}>
                <MapWorld data={data} layout={layout} folded={folded} current={current} />
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}
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

// 지도 안 내용 — 확대·이동은 바깥 transform 만 바뀌어 다시 그리지 않는다(memo). 지금 보는 곳이 바뀔 때만 다시 그림.
const MapWorld = memo(function MapWorld({
  data,
  layout,
  folded,
  current,
}: {
  data: MyLifeData;
  layout: MyLifeLayout;
  folded: Set<string>;
  current: string | null;
}) {
  const byKey = new Map<string, LayoutNode>(layout.nodes.map((n) => [n.key, n]));
  const pos = (n: LayoutNode) => ({ left: n.x, top: n.y, width: n.w, height: n.h });
  return (
    <>
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
      <ol aria-label={C.mapListLabel}>
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
                className={`absolute flex flex-col items-center justify-center rounded-[50%] border-[3px] bg-banner px-9 py-3.5 text-center hover:bg-surface ${current === ev.id ? "border-ink" : "border-action"} ${FOCUS}`}
                aria-current={current === ev.id ? "location" : undefined}
                style={pos(en)}
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
                        <StoryNode story={s} node={n} pos={pos(n)} />
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
              {open && ev.branches.length > 0 && (
                <ul aria-label={C.listBranches}>
                  {ev.branches.map((b, bi) => {
                    const n = byKey.get(`br:${ev.id}:${b.kind}:${b.id}`);
                    return n ? (
                      <li key={`${b.kind}:${b.id}`}>
                        <BranchNode branch={b} nodeKey={n.key} eventId={ev.id} index={bi} pos={pos(n)} />
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
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

function StoryNode({ story, node, pos }: { story: MyLifeStory; node: Extract<LayoutNode, { kind: "story" }>; pos: React.CSSProperties }) {
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
      data-story-id={story.id}
      aria-label={storyAriaLabel(story)}
      className={`absolute flex flex-col overflow-hidden border-2 bg-surface px-[14px] py-3 text-left hover:bg-banner ${story.kind === "SELF" ? "border-sage" : "border-ink-soft"} ${FOCUS}`}
      style={{ ...pos, borderRadius: "32px 6px 32px 32px" }}
    >
      {tag && (
        <span className="block h-7 shrink-0 truncate text-lg leading-7 text-ink-soft">{tag}</span>
      )}
      <span className="line-clamp-2 shrink-0 text-lg leading-[26px] text-ink">{storyLead(story.content)}</span>
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

function BranchNode({ branch, nodeKey, eventId, index, pos }: { branch: MyLifeBranch; nodeKey: string; eventId: string; index: number; pos: React.CSSProperties }) {
  const Icon = branch.kind === "person" ? UserRound : branch.kind === "group" ? Users : MapPin;
  const color = branch.kind === "place" ? "border-sky-700" : "border-emerald-700";
  const iconColor = branch.kind === "place" ? "text-sky-700" : "text-emerald-700";
  return (
    <button
      type="button"
      data-node-key={nodeKey}
      data-node-kind="branch"
      data-event-id={eventId}
      data-branch-index={String(index)}
      aria-label={branchAriaLabel(branch)}
      className={`absolute flex items-center gap-2 border-2 bg-surface px-5 text-left text-lg text-ink hover:bg-banner ${color} ${FOCUS}`}
      style={{ ...pos, borderRadius: "6px 32px 32px 32px" }}
    >
      <Icon aria-hidden size={20} className={`shrink-0 ${iconColor}`} />
      <span className="truncate">{branch.name}</span>
    </button>
  );
}

// ── 목록 보기(?view=list) — 같은 데이터·같은 패널, 절대 좌표·배율 없이 일반 흐름 ────────────

function ListMode({ data, openPanel, onToggleView }: { data: MyLifeData; openPanel: (t: PanelTarget, key: string) => void; onToggleView: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0">{C.pageTitle}</h1>
        <Button variant="secondary" size="lg" onClick={onToggleView}>
          {C.toMap}
        </Button>
      </div>
      <ol aria-label={C.mapListLabel} className="flex flex-col gap-6">
        {data.events.map((ev) => (
          <li key={ev.id} className="flex flex-col gap-3">
            <button
              type="button"
              data-node-key={`ev:${ev.id}`}
              aria-label={eventAriaLabel(ev)}
              onClick={() => openPanel({ kind: "event", eventId: ev.id }, `ev:${ev.id}`)}
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
                        data-node-key={key}
                        aria-label={storyAriaLabel(s)}
                        onClick={() => openPanel({ kind: "story", eventId: ev.id, storyId: s.id }, key)}
                        className={`flex min-h-[56px] w-full flex-col gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left hover:bg-banner ${s.kind === "SELF" ? "border-sage" : "border-ink-soft"} ${FOCUS}`}
                      >
                        {tag && <span className="text-lg text-ink-soft">{tag}</span>}
                        <span className="text-lg text-ink">{storyLead(s.content)}</span>
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
            {ev.branches.length > 0 && (
              <ul aria-label={C.listBranches} className="ml-6 flex flex-col gap-2">
                {ev.branches.map((b, bi) => {
                  const key = `br:${ev.id}:${b.kind}:${b.id}`;
                  const Icon = b.kind === "person" ? UserRound : b.kind === "group" ? Users : MapPin;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        data-node-key={key}
                        aria-label={branchAriaLabel(b)}
                        onClick={() => openPanel({ kind: "branch", eventId: ev.id, index: bi }, key)}
                        className={`flex min-h-[56px] w-full items-center gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left text-lg text-ink hover:bg-banner ${b.kind === "place" ? "border-sky-700" : "border-emerald-700"} ${FOCUS}`}
                      >
                        <Icon aria-hidden size={20} className={`shrink-0 ${b.kind === "place" ? "text-sky-700" : "text-emerald-700"}`} />
                        <span>{b.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}

// ── 패널(정보 보기만 — 넣기·빼기는 2b-3b) ────────────────────────────

function PanelBody({
  target,
  eventById,
  folded,
  showFold,
  onToggleFold,
}: {
  target: PanelTarget;
  eventById: Map<string, MyLifeEvent>;
  folded: Set<string>;
  showFold: boolean;
  onToggleFold: (eventId: string) => void;
}) {
  const ev = eventById.get(target.eventId);
  if (!ev) return null;

  if (target.kind === "event") {
    const people = new Set<string>();
    const places = new Set<string>();
    for (const s of ev.stories) for (const c of s.chips) (c.kind === "place" ? places : people).add(`${c.kind}:${c.id ?? c.name}`);
    for (const b of ev.branches) (b.kind === "place" ? places : people).add(`${b.kind}:${b.id}`);
    const branchCount = ev.stories.length + ev.branches.length;
    return (
      <>
        <p className="text-lg text-ink-soft">{yearText(ev)}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {ev.label}
        </h2>
        <p className="text-lg text-ink">
          {C.panelStories(ev.stories.length)} · {C.panelPeople(people.size)} · {C.panelPlaces(places.size)}
        </p>
        {showFold && branchCount > 0 && (
          <Button variant="secondary" size="lg" aria-expanded={!folded.has(ev.id)} onClick={() => onToggleFold(ev.id)}>
            {folded.has(ev.id) ? C.unfold(branchCount) : C.fold}
          </Button>
        )}
      </>
    );
  }

  if (target.kind === "story") {
    const s = ev.stories.find((x) => x.id === target.storyId);
    if (!s) return null;
    return <StoryPanel ev={ev} story={s} eventById={eventById} />;
  }

  const b = ev.branches[target.index];
  if (!b) return null;
  return (
    <>
      <p className="text-lg text-ink-soft">
        {b.kind === "person" ? C.kindPerson : b.kind === "group" ? C.groupTag : C.kindPlace} · {ev.label}
      </p>
      <h2 id="mylife-panel-title" className="m-0">
        {b.name}
      </h2>
      {b.kind === "person" && (
        <>
          {b.relation && (
            <p className="text-lg text-ink">
              {C.panelRelation}: {b.relation}
            </p>
          )}
          {b.metYear !== null && (
            <p className="text-lg text-ink">
              {C.panelMetYear}: {b.metYear}
            </p>
          )}
          <ButtonLink href={`/people/${b.id}`} variant="secondary" size="lg">
            {C.openPerson}
          </ButtonLink>
        </>
      )}
      {b.kind === "group" && b.members.length > 0 && (
        <p className="text-lg text-ink">
          {C.panelMembers}: {b.members.join(", ")}
        </p>
      )}
      {b.kind === "place" && (
        <>
          {b.address && (
            <p className="text-lg text-ink">
              {C.panelAddress}: {b.address}
            </p>
          )}
          <a href={placeMapHref(b)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "lg")}>
            {C.openMap} ↗
          </a>
        </>
      )}
    </>
  );
}

function StoryPanel({ ev, story, eventById }: { ev: MyLifeEvent; story: MyLifeStory; eventById: Map<string, MyLifeEvent> }) {
  const [full, setFull] = useState(false);
  const people = story.chips.filter((c) => c.kind !== "place");
  const places = story.chips.filter((c) => c.kind === "place");
  const others = story.otherEventIds.map((id) => eventById.get(id)).filter((e): e is MyLifeEvent => !!e);
  return (
    <>
      <p className="text-lg text-ink-soft">
        {story.kind === "SELF" ? `${C.selfTag} · ` : ""}
        {yearText(ev)} {ev.label}
      </p>
      <h2 id="mylife-panel-title" className="m-0 text-2xl">
        {storyLead(story.content)}
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
