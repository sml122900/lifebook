"use client";

// My Life 마인드맵(2b-3a, 보기 전용) — docs/phase/node-graph-self.md §6 2b.1.
//
// 이동 = 브라우저 기본 스크롤(관성·키보드·포커스 자동 스크롤 그대로), 확대 = 배율 값(Q42 — 직접 구현, 의존성 0).
//   스크롤 상자 → 크기 상자(세계 × 배율) → 세계(transform: scale). 기본 배율에서 세계 폭(342)이 390 화면에
//   맞아 가로 스크롤 0. 두 손가락 오므리기는 손가락 2개일 때만 touchmove 를 막고 직접 배율을 바꾼다.
// 지도 DOM 자체가 시기 순 목록(ol > li)이라 스크린리더는 목록으로 읽는다(위치만 절대 좌표).
// 노드를 누르면 아래 패널(<dialog> — 포커스 가두기·Esc·바깥 누르기). 이번 단계는 정보 보기만.

import { MapPin, Minus, Plus, UserRound, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

const MAX_SCALE = 2;
const STEP = 1.25;
const MIN_FIT = 0.15;
const STORE_KEY = "mylife:v1";

type PanelTarget =
  | { kind: "event"; eventId: string }
  | { kind: "story"; eventId: string; storyId: string }
  | { kind: "branch"; eventId: string; index: number };

type Saved = { scale: number; top: number; left: number; folded: string[] };

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null");
    if (v && typeof v.scale === "number" && typeof v.top === "number" && typeof v.left === "number" && Array.isArray(v.folded)) return v;
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  const eventById = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);

  const openPanel = useCallback((t: PanelTarget, key: string) => {
    lastKeyRef.current = key;
    setPanel(t);
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (panel && !d.open) d.showModal();
    if (!panel && d.open) d.close();
  }, [panel]);

  function onDialogClose() {
    setPanel(null);
    const key = lastKeyRef.current;
    if (key) document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`)?.focus();
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
          panelOpen={panel !== null}
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
          if (e.target === dialogRef.current) dialogRef.current.close();
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

// ── 지도 ────────────────────────────────────────────────────────────

type Pending = { kind: "anchor"; wx: number; wy: number; cx: number; cy: number } | { kind: "abs"; top: number; left: number };

function MapMode({
  data,
  folded,
  setFolded,
  toggleFold,
  openPanel,
  panelOpen,
  onToggleView,
}: {
  data: MyLifeData;
  folded: Set<string>;
  setFolded: (s: Set<string>) => void;
  toggleFold: (eventId: string) => void;
  openPanel: (t: PanelTarget, key: string) => void;
  panelOpen: boolean;
  onToggleView: () => void;
}) {
  const layout = useMemo(() => layoutMyLife(data, { folded }), [data, folded]);
  const regionRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [regionTop, setRegionTop] = useState(0);
  const [size, setSize] = useState({ w: 390, h: 600 });
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState("");
  const [announce, setAnnounce] = useState("");

  const [defaultScale, setDefaultScale] = useState(1);

  // 콜백·네이티브 리스너가 읽는 최신 값(렌더 중에는 읽지도 쓰지도 않는다 — 아래 effect 가 맞춘다).
  const scaleRef = useRef(1);
  const layoutRef = useRef(layout);
  const defaultScaleRef = useRef(1);
  const fitRef = useRef(1);
  const pendingRef = useRef<Pending | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offX = (s: number, w: number) => Math.max(8, (w - L.WORLD_W * s) / 2);
  const fitScale = clamp(Math.min(size.w / (L.WORLD_W + 16), size.h / layout.height), MIN_FIT, defaultScale);
  const overview = scale < L.OVERVIEW_SCALE;

  useLayoutEffect(() => {
    layoutRef.current = layout;
    fitRef.current = fitScale;
    defaultScaleRef.current = defaultScale;
  }, [layout, fitScale, defaultScale]);

  const updateNow = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const band = bandAt(layoutRef.current, (sc.scrollTop + sc.clientHeight / 2) / scaleRef.current);
    const ev = band ? data.events.find((e) => e.id === band.eventId) : undefined;
    setNow(ev ? C.nowViewing(ev.year === null ? `${ev.label}(${C.yearUnknown})` : `${yearText(ev)} ${ev.label}`) : C.nowViewingNone);
  }, [data]);

  const save = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    writeSaved({ scale: scaleRef.current, top: sc.scrollTop, left: sc.scrollLeft, folded: [...folded] });
  }, [folded]);

  // 영역 높이 = 화면 − 위쪽(머리) — 지도만 스크롤되게.
  useLayoutEffect(() => {
    const measure = () => {
      if (regionRef.current) setRegionTop(regionRef.current.getBoundingClientRect().top + window.scrollY);
      const sc = scrollerRef.current;
      if (sc) setSize({ w: sc.clientWidth, h: sc.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 첫 표시 — 기본 배율(데스크톱은 크게) + 같은 탭의 마지막 위치·배율·접힘 복원.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const w = sc.clientWidth;
    const d = w >= 600 ? Math.min(1.5, w / 390) : 1;
    defaultScaleRef.current = d;
    setDefaultScale(d);
    const saved = readSaved();
    const valid = saved ? saved.folded.filter((id) => data.events.some((e) => e.id === id)) : null;
    if (saved && valid) setFolded(new Set(valid));
    const s = saved ? clamp(saved.scale, MIN_FIT, MAX_SCALE) : d;
    scaleRef.current = s;
    setScale(s);
    pendingRef.current = saved ? { kind: "abs", top: saved.top, left: saved.left } : { kind: "abs", top: 0, left: 0 };
    setReady(true);
    // 마운트 1회 — data 가 바뀌면(서버 새로고침) 위치는 그대로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 배율·배치가 바뀐 뒤 스크롤 위치 맞추기(확대 중심점 유지·복원).
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    const p = pendingRef.current;
    if (!sc || !p) return;
    pendingRef.current = null;
    if (p.kind === "anchor") {
      sc.scrollLeft = p.wx * scale + offX(scale, sc.clientWidth) - p.cx;
      sc.scrollTop = p.wy * scale - p.cy;
    } else {
      sc.scrollTop = p.top;
      sc.scrollLeft = p.left;
    }
    updateNow();
  }, [scale, layout, size, updateNow]);

  useEffect(() => {
    if (ready) save();
  }, [ready, folded, save]);

  // 전체 보기 상태가 되면 세계가 inert 가 돼 그 안의 포커스가 사라진다 — 지도 영역으로 옮겨
  // 단축키(1 = 기본 배율)와 Tab(→ 목차 버튼)이 계속 되게 한다.
  useEffect(() => {
    if (!overview) return;
    const sc = scrollerRef.current;
    const a = document.activeElement;
    if (sc && (!a || a === document.body || (a instanceof HTMLElement && a.closest("[inert]")))) sc.focus({ preventScroll: true });
  }, [overview]);

  const zoomTo = useCallback((target: number, anchor?: { cx: number; cy: number }, speak = false) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const s = scaleRef.current;
    const next = clamp(target, fitRef.current, MAX_SCALE);
    if (Math.abs(next - s) < 0.001) return;
    const a = anchor ?? { cx: sc.clientWidth / 2, cy: sc.clientHeight / 2 };
    pendingRef.current = {
      kind: "anchor",
      wx: (sc.scrollLeft + a.cx - Math.max(8, (sc.clientWidth - L.WORLD_W * s) / 2)) / s,
      wy: (sc.scrollTop + a.cy) / s,
      cx: a.cx,
      cy: a.cy,
    };
    scaleRef.current = next;
    setScale(next);
    if (speak) setAnnounce(C.zoomAnnounce(Math.round(next * 100)));
  }, []);

  const fitAll = useCallback(() => {
    pendingRef.current = { kind: "abs", top: 0, left: 0 };
    scaleRef.current = fitRef.current;
    setScale(fitRef.current);
    setAnnounce(C.zoomAnnounce(Math.round(fitRef.current * 100)));
  }, []);

  // 전체 보기 상태에서 중심 이름 → 그 띠로 기본 배율.
  const jumpTo = useCallback((eventId: string) => {
    const sc = scrollerRef.current;
    const band = layoutRef.current.bands.find((b) => b.eventId === eventId);
    if (!sc || !band) return;
    const d = defaultScaleRef.current;
    pendingRef.current = { kind: "anchor", wx: L.TRUNK_X, wy: Math.max(0, band.top - 8), cx: sc.clientWidth / 2, cy: 0 };
    scaleRef.current = d;
    setScale(d);
    setAnnounce(C.zoomAnnounce(Math.round(d * 100)));
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-node-key="ev:${CSS.escape(eventId)}"]`)?.focus({ preventScroll: true }));
  }, []);

  // 두 손가락 오므리기 · Ctrl+휠(트랙패드 오므리기) · Safari gesture 막기.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    let pinch: { d0: number; s0: number } | null = null;
    let raf = 0;
    let want = { s: 1, cx: 0, cy: 0 };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d0: dist(e.touches), s0: scaleRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      want = {
        s: (pinch.s0 * dist(e.touches)) / Math.max(1, pinch.d0),
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
      };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          zoomTo(want.s, { cx: want.cx, cy: want.cy });
        });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      zoomTo(scaleRef.current * Math.exp(-e.deltaY * 0.01), { cx: e.clientX - r.left, cy: e.clientY - r.top });
    };
    const stop = (e: Event) => e.preventDefault();
    sc.addEventListener("touchstart", onStart, { passive: true });
    sc.addEventListener("touchmove", onMove, { passive: false });
    sc.addEventListener("touchend", onEnd);
    sc.addEventListener("touchcancel", onEnd);
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("gesturestart", stop);
    sc.addEventListener("gesturechange", stop);
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener("touchstart", onStart);
      sc.removeEventListener("touchmove", onMove);
      sc.removeEventListener("touchend", onEnd);
      sc.removeEventListener("touchcancel", onEnd);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("gesturestart", stop);
      sc.removeEventListener("gesturechange", stop);
    };
  }, [zoomTo]);

  function onScroll() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateNow();
      save();
    }, 120);
  }

  // 한 글자 단축키는 지도 안에 포커스가 있을 때만(WCAG 2.1.4).
  function onKeyDown(e: React.KeyboardEvent) {
    if (panelOpen || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "+" || e.key === "=") zoomTo(scaleRef.current * STEP, undefined, true);
    else if (e.key === "-") zoomTo(scaleRef.current / STEP, undefined, true);
    else if (e.key === "0") fitAll();
    else if (e.key === "1") zoomTo(defaultScaleRef.current, undefined, true);
    else return;
    e.preventDefault();
  }

  function onWorldClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]");
    if (!el) return;
    const { nodeKey, nodeKind, eventId, storyId, branchIndex } = el.dataset;
    if (!nodeKey || !eventId) return;
    if (nodeKind === "fold") toggleFold(eventId);
    else if (nodeKind === "event") openPanel({ kind: "event", eventId }, nodeKey);
    else if (nodeKind === "story" && storyId) openPanel({ kind: "story", eventId, storyId }, nodeKey);
    else if (nodeKind === "branch" && branchIndex) openPanel({ kind: "branch", eventId, index: Number(branchIndex) }, nodeKey);
  }

  // 전체 보기 상태의 목차 — 겹치는 이름은 건너뛴다(가까이 보면 다 보임).
  const overviewLabels = useMemo(() => {
    if (!overview) return [];
    const out: { eventId: string; top: number; label: string }[] = [];
    let lastBottom = -Infinity;
    for (const b of layout.bands) {
      const top = Math.max(4, b.centerMidY * scale - 28); // 맨 위 띠도 화면 안에
      if (top < lastBottom + 4) continue;
      const ev = data.events.find((e) => e.id === b.eventId);
      if (!ev) continue;
      out.push({ eventId: b.eventId, top, label: `${ev.year === null ? C.yearUnknown : yearText(ev)} ${ev.label}` });
      lastBottom = top + 56;
    }
    return out;
  }, [overview, layout, scale, data]);

  const ox = offX(scale, size.w);
  const anyFolded = folded.size > 0;

  return (
    <div
      ref={regionRef}
      className="flex flex-col"
      style={{ height: regionTop ? `calc(100dvh - ${regionTop}px)` : "calc(100dvh - 72px)", minHeight: 420 }}
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-3">
        <h1 className="m-0">{C.pageTitle}</h1>
        <Button variant="secondary" size="lg" onClick={onToggleView}>
          {C.toList}
        </Button>
      </div>
      <div className="flex min-h-[56px] items-center justify-between gap-3 px-6 py-1">
        <p className="min-w-0 truncate text-lg text-ink-soft">{now}</p>
        {anyFolded && (
          <Button variant="secondary" size="lg" className="shrink-0" onClick={() => setFolded(new Set())}>
            {C.unfoldAll}
          </Button>
        )}
      </div>

      <div
        ref={scrollerRef}
        role="region"
        aria-label={C.mapRegionLabel}
        tabIndex={0}
        data-ready={ready ? "1" : undefined}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain border-y border-line bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand"
        style={{ touchAction: "pan-x pan-y", visibility: ready ? "visible" : "hidden" }}
      >
        <div className="relative" style={{ width: L.WORLD_W * scale + 2 * ox, height: layout.height * scale }}>
          <div
            className="absolute top-0"
            style={{ left: ox, width: L.WORLD_W, height: layout.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            inert={overview}
            onClick={onWorldClick}
          >
            <MapWorld data={data} layout={layout} folded={folded} />
          </div>
          {overviewLabels.map((o) => (
            <button
              key={o.eventId}
              type="button"
              aria-label={C.overviewJump(o.label)}
              onClick={() => jumpTo(o.eventId)}
              className={`absolute flex h-14 max-w-[300px] -translate-x-1/2 items-center rounded-md border-2 border-action bg-surface px-4 text-lg font-semibold text-ink hover:bg-banner ${FOCUS}`}
              style={{ top: o.top, left: ox + L.TRUNK_X * scale }}
            >
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-surface py-2 pl-4 pr-[104px]">
        <Button variant="secondary" size="lg" className="w-14 px-0!" aria-label={C.zoomOut} disabled={scale <= fitScale + 0.001} onClick={() => zoomTo(scale / STEP, undefined, true)}>
          <Minus aria-hidden size={24} className="shrink-0" />
        </Button>
        <Button variant="secondary" size="lg" className="w-14 px-0!" aria-label={C.zoomIn} disabled={scale >= MAX_SCALE - 0.001} onClick={() => zoomTo(scale * STEP, undefined, true)}>
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

// 세계 안 내용 — 배율이 바뀌어도 다시 그리지 않게 memo(배율은 바깥 transform 만).
const MapWorld = memo(function MapWorld({ data, layout, folded }: { data: MyLifeData; layout: MyLifeLayout; folded: Set<string> }) {
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
                className={`absolute flex flex-col items-center justify-center rounded-[50%] border-[3px] border-action bg-banner px-9 py-3.5 text-center hover:bg-surface ${FOCUS}`}
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
