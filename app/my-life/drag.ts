// My Life 끌어 넣기 — 화면 쪽(우주 개편 U3, docs/phase/ui-space.md §4). 계산은 lib/space-drag(순수 함수).
//
// 한 번에 손가락 하나의 "누름" 하나만. 끄는 것([data-drag])을 누르면 beginPress — LONG_PRESS_MS 안에 8px 넘게 움직이면 아무것도 안 함
// (지도 이동·패널 스크롤이 그대로), 그만큼 가만히 누르면 집기: 떠 있는 그림(ghost)이 손가락을 따라오고(포인터 이벤트당 transform 한 번),
// 놓을 수 있는 행성은 은은하게 빛나며(지도 [data-dragging] + 행성 [data-drop-ok]) 놓을 행성은 고리 + 점선(자석 — [data-drop-target]).
// 놓으면 나선으로 궤도에 들어가고 행성이 출렁인다(Web Animations 한 번씩), 못 넣으면 튕겨 제자리. 두 번째 손가락·취소 = 튕김.
// 낙관적 반영(U3 후속): 저장은 놓는 순간 시작하되 기다리지 않는다 — 나선이 끝나면 onLand(화면이 위성을 바로 보임), 저장 결과는
// onSettled(실패면 화면이 위성을 빼고 그림이 궤도에서 튕겨 제자리). 지도 이동은 나선이 끝나면 다시 켜짐(저장 응답과 무관).
// 연출 없이(움직임 줄이기·[움직임 멈추기]) = 그림만 바로 치우고 놓는 순간 onLand. 진동은 Android 만(집을 때·들어갈 때).
// rAF 는 집은 채 지도 가장자리에 머물 때(자동 이동)만 돈다 — 공전처럼 늘 도는 코드 없음.

import {
  BOUNCE_EASING,
  BOUNCE_MS,
  DRAG_SLOP,
  EDGE_ARM,
  EDGE_PX,
  EDGE_SPEED,
  LONG_PRESS_MS,
  SPIRAL_MS,
  SPIRAL_TURN,
  VIBRATE_DROP_MS,
  VIBRATE_GRAB_MS,
  WOBBLE_MS,
  isAndroid,
  pickDropTarget,
  spiralPath,
  wobbleScales,
  type DropPlanet,
  type Pt,
} from "@/lib/space-drag";

import type { CreatedLink } from "@/lib/my-life-edit";
import type { OptLink } from "@/lib/my-life-optimistic";
import type { NodeRef } from "@/lib/node-graph";

import { readMotion } from "./orbit";

export type DragKind = "person" | "place" | "group";

// 지도 라이브러리(react-zoom-pan-pinch 4.2.0) 인스턴스의 이동·확대를 바로 끄고 켬 — 라이브러리가 움직일 때마다 setup.panning.disabled 를
// 다시 읽는다. props 로만 끄면 React 가 다시 그릴 때까지 첫 이동 몇 개가 지도를 끌었다(390×667 실측). 모양이 다르면 아무것도 안 함.
export function lockPanZoom(instance: unknown, on: boolean) {
  const inst = instance as { setup?: { panning?: object; pinch?: object } } | undefined;
  if (!inst?.setup?.panning || !inst.setup.pinch) return;
  inst.setup = { ...inst.setup, panning: { ...inst.setup.panning, disabled: on }, pinch: { ...inst.setup.pinch, disabled: on } };
}
export type DropResult = "added" | "already" | "failed";

// 낙관적 연결 입구(MyLifeView 가 만듦 — 지도 끌기·패널 "넣을 것" 줄이 같이 씀, lib/my-life-optimistic).
export type OptLinks = {
  show: (o: Omit<OptLink, "id" | "saved">) => number; // 위성 바로 보임(항목 번호)
  saved: (id: number) => void; // 저장 끝 — 서버 데이터에 보이면 항목이 지워짐
  hide: (id: number) => void; // 저장 실패 — 위성 빠짐
  refresh: () => void;
  undo: (planet: NodeRef, sat: NodeRef, created: CreatedLink[]) => Promise<{ ok: boolean }>; // 응답 전에 숨김, 실패면 다시 보임
};
export type BounceWhy = "far" | "already" | "cancel";

export type PressOptions = {
  kind: DragKind;
  name: string;
  origin: HTMLElement; // 누른 요소(튕겨 돌아올 자리)
  pointer: { id: number; x: number; y: number; t: number }; // t = 누른 이벤트의 발생 시각(event.timeStamp)
  ghostHost: HTMLElement; // 떠 있는 그림을 넣을 곳 — 지도 = body, 패널 줄 = 열린 dialog(맨 위 층)
  edgeBox: HTMLElement | null; // 가장자리 자동 이동 기준(지도). 패널 줄 = null
  planets: () => DropPlanet[]; // 화면 좌표(집을 때·자동 이동 때마다 다시)
  allowed: ReadonlySet<string>; // 놓을 수 있는 행성 키(이미 그 행성 위성이면 빠짐)
  planetEl: (key: string) => HTMLElement | null;
  onGrab: () => void;
  onAutoPan: (dx: number, dy: number) => void;
  onDrop: (key: string) => Promise<DropResult>; // 저장 시작(서버만 — 화면은 onLand·onSettled)
  onLand: (key: string) => void; // 궤도에 든 순간(나선 끝 · 연출 없으면 놓는 순간) — 저장 응답 전에 위성을 보임. 그새 실패·이미 있음이 왔으면 안 불림
  onSettled: (key: string, r: DropResult, landed: boolean) => void; // 저장 결과(onLand 뒤) — 실패면 위성을 빼고 알림
  onBounce: (why: BounceWhy) => void;
  onEnd: () => void;
};

let active: { cancel: () => void } | null = null;
let suppressUntil = 0;

// 끌기가 막 끝났으면 그 손을 뗄 때 생기는 클릭(패널 열기·넣기 버튼)을 무시한다.
export const dragJustEnded = () => performance.now() < suppressUntil;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// 연출 없이 — 움직임 줄이기 또는 [움직임 멈추기]
export const stillMotion = () => reduced() || readMotion() === "stop";
const vibrate = (ms: number) => {
  if (isAndroid(navigator.userAgent)) navigator.vibrate?.(ms);
};

function makeGhost(o: PressOptions): HTMLElement {
  const g = document.createElement("div");
  g.className = "space-ghost";
  g.setAttribute("aria-hidden", "true");
  const moon = document.createElement("span");
  moon.className = `flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold ${
    o.kind === "place" ? "moon-place border-place" : "moon-person border-person"
  } ${o.kind === "group" ? "border-dashed" : ""}`;
  const icon = o.kind === "person" ? null : o.origin.querySelector("svg");
  if (icon) moon.appendChild(icon.cloneNode(true));
  else moon.textContent = o.name.slice(0, 1);
  const label = document.createElement("span");
  label.className = "max-w-[120px] truncate text-center text-lg leading-6 text-ink";
  label.textContent = o.name;
  g.append(moon, label);
  o.ghostHost.appendChild(g);
  return g;
}

// 떠 있는 그림의 원 가운데를 p 에(그림 폭 120 · 원 48 — 원 가운데 = 위 24px).
const at = (p: Pt) => `translate(${Math.round(p.x - 60)}px, ${Math.round(p.y - 24)}px)`;
const lift = (p: Pt) => `${at(p)} scale(1.14)`; // 집은 채 = 1.14배로 떠오름(§4.1)

export function beginPress(o: PressOptions) {
  active?.cancel();
  let grabbed = false;
  let ended = false;
  let ghost: HTMLElement | null = null;
  let target: string | null = null;
  let last: Pt = { x: o.pointer.x, y: o.pointer.y };
  let edge = { dx: 0, dy: 0 };
  let raf = 0;
  let rafT = 0;
  let grabAt: Pt | null = null; // 집은 자리 — 여기서 EDGE_ARM 넘게 움직인 뒤에만 가장자리 자동 이동(가장자리 가까이 있던 것을 집자마자 지도가 흐르지 않게)
  let armed = false;
  const box = o.edgeBox?.getBoundingClientRect() ?? null;

  const setTarget = (k: string | null) => {
    if (k === target) return;
    if (target) o.planetEl(target)?.removeAttribute("data-drop-target");
    target = k;
    if (k) o.planetEl(k)?.setAttribute("data-drop-target", "");
  };
  const retarget = () => setTarget(pickDropTarget(last, o.planets(), o.allowed));

  const cleanup = () => {
    ended = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("pointerdown", onSecond, true);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("contextmenu", onContext, true);
    if (active?.cancel === cancel) active = null;
  };
  const finish = () => {
    setTarget(null);
    ghost?.remove();
    ghost = null;
    o.onEnd();
  };

  // 가장자리 자동 이동 — 집은 채 지도 가장자리 EDGE_PX 안에 머무는 동안만(초당 EDGE_SPEED, 배율 그대로).
  const tick = (t: number) => {
    const dt = rafT ? Math.min(50, t - rafT) : 16;
    rafT = t;
    const d = (EDGE_SPEED * dt) / 1000;
    o.onAutoPan(edge.dx * d, edge.dy * d);
    retarget();
    raf = edge.dx || edge.dy ? requestAnimationFrame(tick) : 0;
  };
  const checkEdge = () => {
    if (!box || !grabAt) return;
    if (!armed) armed = Math.hypot(last.x - grabAt.x, last.y - grabAt.y) > EDGE_ARM;
    if (!armed) return;
    const dx = last.x < box.left + EDGE_PX ? 1 : last.x > box.right - EDGE_PX ? -1 : 0;
    const dy = last.y < box.top + EDGE_PX ? 1 : last.y > box.bottom - EDGE_PX ? -1 : 0;
    edge = { dx, dy };
    if ((dx || dy) && !raf) {
      rafT = 0;
      raf = requestAnimationFrame(tick);
    }
  };

  const grab = () => {
    if (ended) return;
    grabbed = true;
    grabAt = last;
    ghost = makeGhost(o);
    ghost.style.transform = lift(last);
    o.onGrab();
    vibrate(VIBRATE_GRAB_MS);
    retarget();
  };
  const timer = setTimeout(grab, LONG_PRESS_MS);

  function onMove(e: PointerEvent) {
    if (e.pointerId !== o.pointer.id) return;
    last = { x: e.clientX, y: e.clientY };
    const moved = Math.hypot(last.x - o.pointer.x, last.y - o.pointer.y) > DRAG_SLOP;
    // 메인 스레드가 바빠 이동 이벤트가 집기 타이머보다 늦게 처리돼도, 손가락이 실제로 움직인 시각(발생 시각)이 집기 전이면 지도 이동 —
    // 집기를 되돌린다(4배 감속 실측에서 250ms 뒤 움직임이 집힘으로 들어가던 것). 지도 이동은 onEnd 로 다시 켜져 그 손가락으로 이어진다.
    if (grabbed && moved && e.timeStamp - o.pointer.t < LONG_PRESS_MS) {
      setTarget(null);
      ghost?.remove();
      ghost = null;
      cleanup();
      o.onEnd();
      return;
    }
    if (!grabbed) {
      // 집기 전에 8px 넘게 움직임 = 지도 이동·스크롤(이 누름은 끝)
      if (moved) cleanup();
      return;
    }
    if (ghost) ghost.style.transform = lift(last);
    retarget();
    checkEdge();
  }

  // 튕겨 제자리 — 누른 요소 가운데로.
  const bounce = (why: BounceWhy, from: Pt = last) => {
    cleanup();
    suppressUntil = performance.now() + 500;
    o.onBounce(why);
    const g = ghost;
    if (!g || stillMotion()) return finish();
    const r = o.origin.getBoundingClientRect();
    const home = { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 32) };
    g.animate([{ transform: lift(from) }, { transform: at(home) }], { duration: BOUNCE_MS, easing: BOUNCE_EASING }).finished.then(finish, finish);
  };

  async function drop(key: string) {
    cleanup();
    suppressUntil = performance.now() + 500;
    const planet = o.planetEl(key);
    const g = ghost;
    let settled: DropResult | null = null;
    const result = o.onDrop(key).then(
      (r) => (settled = r),
      (): DropResult => (settled = "failed"),
    );
    const moving = !!g && !!planet && !stillMotion();
    let end: Pt | null = null;
    if (moving) {
      // 나선 — 놓은 점에서 행성 둘레를 감아 궤도 위 점으로(궤도 = 행성 지름 + 64 남짓, 화면 배율 그대로)
      const pr = planet!.getBoundingClientRect();
      const c = { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
      const a = Math.atan2(last.y - c.y, last.x - c.x) + SPIRAL_TURN;
      const orbitR = pr.width / 2 + pr.width * 0.25 + 24;
      end = { x: c.x + orbitR * Math.cos(a), y: c.y + orbitR * 0.78 * Math.sin(a) };
      const path = spiralPath(last, c, end);
      await g!.animate(path.map((p, i) => ({ transform: `${at(p)} scale(${(1.14 - (0.14 * i) / (path.length - 1)).toFixed(3)})` })), { duration: SPIRAL_MS, easing: "linear", fill: "forwards" }).finished.catch(() => {});
    }
    // 궤도에 듦 — 저장 응답을 기다리지 않고 위성을 보인다(나선 동안 이미 실패·이미 있음이 왔으면 안 들임).
    const early = settled as DropResult | null; // 콜백이 바꾼 값(타입 좁히기 막음)
    const landed = early !== "failed" && early !== "already";
    if (landed) {
      o.onLand(key);
      if (moving) {
        vibrate(VIBRATE_DROP_MS);
        planet!.animate(wobbleScales().map((s) => ({ transform: `scale(${s})` })), { duration: WOBBLE_MS, easing: "linear" });
      }
    }
    if (g && moving && early !== "failed") await g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).finished.catch(() => {});
    setTarget(null);
    if (!moving) g?.remove(); // 연출 없이 — 그림은 바로 치움(튕길 궤도 자리가 없음)
    o.onEnd(); // 지도 이동·확대 다시 켬 — 저장 응답과 무관
    const r = await result;
    o.onSettled(key, r, landed);
    // 저장 실패 — 궤도에서 빠져 원래 자리로(누른 것이 화면에 남아 있을 때만)
    if (r === "failed" && g && end && o.origin.isConnected) {
      const or = o.origin.getBoundingClientRect();
      const home = { x: or.left + or.width / 2, y: or.top + Math.min(or.height / 2, 32) };
      await g.animate([{ transform: at(end), opacity: 1 }, { transform: at(home), opacity: 1 }], { duration: BOUNCE_MS, easing: BOUNCE_EASING }).finished.catch(() => {});
    }
    g?.remove();
    if (ghost === g) ghost = null;
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== o.pointer.id) return;
    if (!grabbed) return cleanup(); // 짧게 누름 = 탭(클릭이 처리)
    last = { x: e.clientX, y: e.clientY };
    retarget();
    if (target) void drop(target);
    else {
      // 놓을 곳이 없을 때 — 이미 그 위성이 있는 행성 위면 "이미 들어 있어요", 아니면 "멀어서"
      const all = o.planets();
      bounce(pickDropTarget(last, all, new Set(all.map((p) => p.key))) ? "already" : "far");
    }
  }
  function onCancel(e: PointerEvent) {
    if (e.pointerId !== o.pointer.id) return;
    if (grabbed) bounce("cancel");
    else cleanup();
  }
  // 집은 채 두 번째 손가락 = 끌기 취소(다음 손짓부터 확대 가능)
  function onSecond(e: PointerEvent) {
    if (e.pointerId === o.pointer.id) return;
    if (grabbed) bounce("cancel");
    else cleanup();
  }
  // 집은 뒤엔 패널·페이지가 스크롤하지 않게(집기 전엔 그대로 — 그때 움직이면 이 누름이 끝남)
  function onTouchMove(e: TouchEvent) {
    if (grabbed && e.cancelable) e.preventDefault();
  }
  function onContext(e: Event) {
    e.preventDefault();
  }
  const cancel = () => {
    if (grabbed && !ended) bounce("cancel");
    else cleanup();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("pointerdown", onSecond, true);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("contextmenu", onContext, true);
  active = { cancel };
}
