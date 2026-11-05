// My Life 공전 — 화면 쪽(우주 개편 U2, docs/phase/ui-space.md §2.1~2.3).
// 프레임마다 도는 코드 없음(rAF·setInterval 0 — 회귀 test-my-life ⑬ 이 지킴). 하는 일은 셋뿐:
//   ① 화면 안(위아래·좌우 한 화면 여유) 계만 공전 표식(IntersectionObserver — 경계를 넘을 때만 불림) + 그때 문서 시계 지연을 붙임
//   ② 행성을 고를 때 그 계 위성을 지금 자리 → 펼침 자리로, 풀 때 펼침 자리 → 궤도 자리로 300ms 한 번(Web Animations — 합성기)
//   ③ [움직임 멈추기] 기기 기억(localStorage) + reduced-motion 이면 처음부터 멈춤
// 키프레임·자리 계산은 lib/space-orbit(순수 함수).

import { orbitDelayMs, orbitPoint, orbitProgressAt, orbitShape } from "@/lib/space-orbit";

export const MOTION_KEY = "mylife:motion";
const MOTION_EVENT = "mylife:motion";
export type MotionPref = "run" | "stop";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 기기에 기억한 값이 있으면 그것, 없으면 reduced-motion 이면 멈춤(§2.2).
export function readMotion(): MotionPref {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    if (v === "run" || v === "stop") return v;
  } catch {
    // 저장소 불가 — 기기 설정만 따름
  }
  return reducedMotion() ? "stop" : "run";
}
export function writeMotion(v: MotionPref) {
  try {
    localStorage.setItem(MOTION_KEY, v);
  } catch {
    // 저장소 불가 — 이 화면에서만
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}
export function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener(MOTION_EVENT, cb);
  window.addEventListener("storage", cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(MOTION_EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

const satsOf = (sys: Element) => [...sys.querySelectorAll<HTMLElement>(".orbit-sat")];

// 계 하나의 위성에 문서 시계 지연을 다시 붙인다 — 다시 공전을 시작할 때 같은 시계라 튀지 않음.
export function syncDelays(sys: Element, now = performance.now()) {
  for (const el of satsOf(sys)) {
    const d = `${orbitDelayMs(Number(el.dataset.frac), now)}ms`;
    el.style.animationDelay = d;
    // 이름표에도 같은 값을 직접(animation-delay: inherit 은 합성기로 못 넘겨 메인 스레드가 매 프레임 계산 — U2 실측)
    const lbl = el.querySelector<HTMLElement>(":scope > .orbit-lbl");
    if (lbl) lbl.style.animationDelay = d;
  }
}

// ① 화면 안 계만 공전. root = 지도를 자르는 감싼 상자(그 사이에 자르는 조상이 있으면 여유가 지워짐). 돌려주는 함수로 끊는다
//    (배치가 바뀌면 다시 붙임 — 이미 도는 계는 그대로).
export function observeOrbits(root: HTMLElement): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      const now = performance.now();
      for (const e of entries) {
        const sys = e.target as HTMLElement;
        if (e.isIntersecting) {
          if (sys.dataset.orbit !== "on") {
            syncDelays(sys, now);
            sys.dataset.orbit = "on";
          }
        } else sys.dataset.orbit = "off";
      }
    },
    { root, rootMargin: "100% 100% 100% 100%" },
  );
  root.querySelectorAll(".orbit-sys").forEach((el) => io.observe(el));
  return () => io.disconnect();
}

// ② 탭한 순간의 위성 자리 — 펼침 시작점. getComputedStyle 로 읽으면 큰 문서 전체 스타일 계산을 강제해(300 노드 4배 감속 약 115ms)
//    문서 시계로 계산한다(붙인 지연과 같은 식). 돌고 있지 않으면(멈춤·화면 밖) 시작점 없음 = 펼침 자리로 바로.
export function snapshotSats(sys: HTMLElement | null, running: boolean): Map<string, string> | null {
  if (!sys || !running || sys.dataset.orbit !== "on") return null;
  const now = performance.now();
  const m = new Map<string, string>();
  for (const el of satsOf(sys)) {
    const p = orbitPoint(orbitShape(Number(el.dataset.pd), el.dataset.tilt === "1" ? 1 : 0), orbitProgressAt(Number(el.dataset.frac), now));
    m.set(el.dataset.nodeKey ?? "", `translate(${p.x}px,${p.y}px)`);
  }
  return m;
}

const expandedAt = (el: HTMLElement) => `translate(${el.style.getPropertyValue("--ex")},${el.style.getPropertyValue("--ey")})`;

// 펼침 — 지금 자리 → 펼침 자리 300ms(펼침 자리 자체는 CSS [data-open] 규칙). 시작점을 모르면(찾기·만들기로 고른 경우) 바로.
export function animateOpen(sys: Element, from: Map<string, string> | null) {
  if (!from || reducedMotion()) return;
  for (const el of satsOf(sys)) {
    const f = from.get(el.dataset.nodeKey ?? "");
    if (!f || f === "none") continue;
    el.animate([{ transform: f }, { transform: expandedAt(el) }], { duration: 300, easing: "ease-out" });
  }
}

// 접힘 — 지연을 지금 시계로 다시 붙이고(공전이 그 자리에서 이어지게), 펼침 자리 → 300ms 뒤 궤도 자리.
// running = 지도가 돌고 있으면 300ms 뒤 자리, 멈춤이면 지금 자리(멈춘 공전은 지금 시계 자리에 서 있음).
export function animateClose(sys: Element, running: boolean) {
  const now = performance.now();
  syncDelays(sys, now);
  if (reducedMotion()) return;
  for (const el of satsOf(sys)) {
    const s = orbitShape(Number(el.dataset.pd), el.dataset.tilt === "1" ? 1 : 0);
    const p = orbitPoint(s, orbitProgressAt(Number(el.dataset.frac), now + (running ? 300 : 0)));
    el.animate([{ transform: expandedAt(el) }, { transform: `translate(${p.x}px,${p.y}px)` }], { duration: 300, easing: "ease-in-out" });
  }
}
