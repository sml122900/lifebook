// My Life 우주 개편 U3 — 끌어 넣기 계산(순수 함수 — DOM·타이머 0). docs/phase/ui-space.md §4.
//
// 손짓: 끄는 것(사람·장소·모임) 위에서 8px 안으로 LONG_PRESS_MS 누르면 집기, 그 전에 8px 넘게 움직이면 지도 이동(지금 TAP_SLOP 그대로).
// 놓기: 놓은 점이 행성 궤도 타원(화면 배율 반영)의 정규화 거리 DROP_RANGE 안이면 그 행성(겹치면 더 가까운 행성), 아니면 튕겨 제자리.
// 연출(Web Animations 키프레임 — 매 프레임 setState 없음): 넣기 = 나선으로 궤도에 들어감(SPIRAL_MS, 감는 각 SPIRAL_TURN) → 행성 출렁임
// (WOBBLE_MS, 감쇠 사인) · 못 넣음 = 튕겨 돌아옴(BOUNCE_MS, 살짝 넘쳤다 돌아오는 곡선).

export const LONG_PRESS_MS = 280; // 집기(성민 2026-11-05 — 설계 추천 400 대신 시안 값)
export const DRAG_SLOP = 8; // 이만큼 넘게 움직이면 지도 이동(MyLifeView TAP_SLOP 과 같음)
export const DROP_RANGE = 1.7; // 궤도 타원 정규화 거리(시안 값)
export const EDGE_PX = 48; // 집은 채 지도 가장자리 이 안이면 그쪽으로 자동 이동
export const EDGE_SPEED = 240; // 자동 이동 px/초(배율 그대로)
export const EDGE_ARM = 24; // 집은 자리에서 이만큼 움직인 뒤에만 자동 이동(가장자리 가까운 것을 집자마자 흐르지 않게 — 390×667 실측)
export const SPIRAL_MS = 760;
export const SPIRAL_TURN = 2.4; // 라디안
export const WOBBLE_MS = 900;
export const BOUNCE_MS = 520;
export const VIBRATE_GRAB_MS = 8;
export const VIBRATE_DROP_MS = 18;

export type Pt = { x: number; y: number };
// 놓을 후보 — 화면 좌표의 행성 가운데 + 궤도 반지름(배율 반영).
export type DropPlanet = { key: string; cx: number; cy: number; rx: number; ry: number };

export function normDist(p: Pt, t: DropPlanet): number {
  return Math.hypot((p.x - t.cx) / t.rx, (p.y - t.cy) / t.ry);
}

// 놓은 점에서 넣을 행성 — 허용(아직 그 행성 위성이 아닌 것)만, DROP_RANGE 안에서 가장 가까운 것. 없으면 null(튕김).
export function pickDropTarget(p: Pt, planets: readonly DropPlanet[], allowed: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestD = DROP_RANGE;
  for (const t of planets) {
    if (!allowed.has(t.key)) continue;
    const d = normDist(p, t);
    if (d <= bestD) {
      bestD = d;
      best = t.key;
    }
  }
  return best;
}

// 나선 — 놓은 점에서 행성 가운데를 돌며 궤도 위 점(end)으로. 반지름은 놓은 거리 → 궤도 반지름으로 줄고, 각은 SPIRAL_TURN 감긴다.
// 돌려주는 점 = 화면 좌표(끄는 그림의 가운데 자리), steps + 1 개.
export function spiralPath(from: Pt, center: Pt, end: Pt, steps = 24): Pt[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1raw = Math.atan2(end.y - center.y, end.x - center.x);
  // 끝 각 = 시작 각에서 SPIRAL_TURN 만큼 돈 근처의 end 방향(같은 방향으로 감김)
  let a1 = a1raw;
  while (a1 < a0 + SPIRAL_TURN - Math.PI) a1 += 2 * Math.PI;
  while (a1 > a0 + SPIRAL_TURN + Math.PI) a1 -= 2 * Math.PI;
  const r0 = Math.hypot(from.x - center.x, from.y - center.y);
  const r1 = Math.hypot(end.x - center.x, end.y - center.y);
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = 1 - (1 - t) ** 3; // 끝으로 갈수록 느리게
    const a = a0 + (a1 - a0) * e;
    const r = r0 + (r1 - r0) * e;
    out.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return out;
}

// 행성 출렁임 — 감쇠 사인 배율(1 ± 0.08 → 1).
export function wobbleScales(steps = 12): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return +(1 + 0.08 * Math.exp(-4 * t) * Math.sin(t * Math.PI * 5)).toFixed(4);
  });
}

// 튕김 곡선 — 시안의 outBack(살짝 넘쳤다 돌아옴).
export const BOUNCE_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// 진동 — Android 만(iOS Safari 는 진동 API 없음 · 데스크톱 무시).
export const isAndroid = (ua: string) => /Android/i.test(ua);
