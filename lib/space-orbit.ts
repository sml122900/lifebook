// My Life 우주 개편 U2 — 공전 키프레임·자리(순수 함수 — DOM·rAF·타이머 0). docs/phase/ui-space.md §1.2·§1.3·§2.1.
//
// 궤도(행성 반지름 R, 위성 반지름 r = 24): RY = R + 32 · RX = max(128, RY + 16). RY ≥ R + r + 8 이라 위성이 행성 원판을 지나지 않는다.
// 두 번째 궤도(위성 7개부터)는 같은 타원을 60° 기울인 것(짧은 반지름 그대로라 역시 원판과 안 겹침).
// 키프레임 = 궤도 모양마다 한 벌(타원 위 36걸음 translate). 위성 k(궤도 안 n개 중 k번째)는 문서 시계 기준 지연
// −(지금 % 주기 + k/n × 주기)로 자리를 나눈다 — 다시 붙여도 같은 시계라 튀지 않는다. 이름표는 같은 주기·같은 지연의
// 불투명도 키프레임(행성 원판 + 8px 과 겹치는 걸음 0, 아니면 1 — 걸음 사이는 선형이라 한 걸음 페이드, Q107). 지연은 위성·이름표에 같은 값을
// 직접 붙인다(물려받기 inherit 은 합성기로 못 넘김).
// 키프레임 한 벌 = 공전 ORBIT_REVS 바퀴(반복 한 번 = 96초): 반복 경계마다 브라우저가 animationiteration 이벤트를 보내며(React 가 뿌리에
// 애니메이션 이벤트 수신기를 단다) 메인 스레드가 약 75ms 동안 매 프레임 그린다 — 한 바퀴씩이면 경계가 잦아 300 노드 가만히 10~13ms/초,
// 네 바퀴면 그만큼 드물다(U2 실측, ui-space §7.2). 이름표 키프레임은 값이 바뀌는 칸만 남긴다(같은 결과, 글 줄임).
// 화면(app/my-life/orbit.ts)은 지연을 붙이고 표식만 바꾼다 — 프레임마다 도는 코드 없음(움직임은 합성기).

export const ORBIT_PERIOD_MS = 24_000; // 한 바퀴 24초(Q109)
export const ORBIT_STEPS = 36; // 한 바퀴 걸음 수
export const ORBIT_REVS = 4; // 키프레임 한 벌(반복 한 번)에 담는 바퀴 수
export const ORBIT_CYCLE_MS = ORBIT_PERIOD_MS * ORBIT_REVS;
export const ORBIT_TILT_DEG = 60;
export const ORBIT_PER_RING = 6; // 첫 궤도 6개, 넘으면 두 번째 궤도(Q108)
export const SAT_R = 24; // 위성 원 48 의 반지름
export const LABEL_W = 104; // 공전 중 이름표(18px 한 줄 말줄임)
export const LABEL_GAP = 4; // 위성 원 아래 ~ 이름표
export const LABEL_H = 24;
export const LABEL_CLEAR = 8; // 이름표가 행성 원판 + 이만큼과 겹치면 숨김

export type OrbitShape = { planetR: number; rx: number; ry: number; tilt: 0 | 1 };
export type Pt = { x: number; y: number };

export function orbitShape(planetD: number, tilt: 0 | 1): OrbitShape {
  const planetR = planetD / 2;
  const ry = planetR + 32;
  return { planetR, rx: Math.max(128, ry + 16), ry, tilt };
}

// 진행 p(0~1)의 위성 원 가운데 — 행성 가운데 기준(화면 좌표: 아래가 +y).
export function orbitPoint(s: OrbitShape, p: number): Pt {
  const a = 2 * Math.PI * p;
  const x = s.rx * Math.cos(a);
  const y = s.ry * Math.sin(a);
  if (!s.tilt) return { x, y };
  const t = (ORBIT_TILT_DEG * Math.PI) / 180;
  return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
}

// 궤도의 세로·가로 반폭(위성 원 가운데 기준) — 계 상자 크기 계산용.
export function orbitHalfHeight(s: OrbitShape): number {
  if (!s.tilt) return s.ry;
  const t = (ORBIT_TILT_DEG * Math.PI) / 180;
  return Math.sqrt((s.rx * Math.sin(t)) ** 2 + (s.ry * Math.cos(t)) ** 2);
}
export function orbitHalfWidth(s: OrbitShape): number {
  if (!s.tilt) return s.rx;
  const t = (ORBIT_TILT_DEG * Math.PI) / 180;
  return Math.sqrt((s.rx * Math.cos(t)) ** 2 + (s.ry * Math.sin(t)) ** 2);
}

// 위성 원 가운데 c 일 때 이름표 사각형(원 아래 가운데).
export function labelRect(c: Pt): { x: number; y: number; w: number; h: number } {
  return { x: c.x - LABEL_W / 2, y: c.y + SAT_R + LABEL_GAP, w: LABEL_W, h: LABEL_H };
}

// 진행 p 에서 이름표가 보이나 — 이름표 사각형이 행성 원판 + LABEL_CLEAR 원과 안 겹칠 때만(각도가 아니라 기하로, §1.3).
export function labelVisible(s: OrbitShape, p: number): boolean {
  const r = labelRect(orbitPoint(s, p));
  const nx = Math.max(r.x, Math.min(0, r.x + r.w));
  const ny = Math.max(r.y, Math.min(0, r.y + r.h));
  return Math.hypot(nx, ny) >= s.planetR + LABEL_CLEAR;
}

export const orbitName = (s: OrbitShape) => `orb-${s.ry}-${s.tilt}`;
export const labelName = (s: OrbitShape) => `orbl-${s.ry}-${s.tilt}`;

const TOTAL = ORBIT_STEPS * ORBIT_REVS;
const pct = (i: number) => `${+((i / TOTAL) * 100).toFixed(4)}%`;
const px = (v: number) => `${+v.toFixed(2)}px`;

// 키프레임 한 벌 — 0%~100%(ORBIT_REVS 바퀴 × 36걸음 + 1 칸, 100% = 0%).
export function orbitKeyframes(s: OrbitShape): string {
  const stops: string[] = [];
  for (let i = 0; i <= TOTAL; i++) {
    const p = orbitPoint(s, (i % ORBIT_STEPS) / ORBIT_STEPS);
    stops.push(`${pct(i)}{transform:translate(${px(p.x)},${px(p.y)})}`);
  }
  return `@keyframes ${orbitName(s)}{${stops.join("")}}`;
}
// 이름표 — 걸음마다 0/1 이지만 앞뒤와 같은 칸은 빼도 선형 보간 결과가 같다(값이 바뀌는 자리 양옆만 남김).
export function labelKeyframes(s: OrbitShape): string {
  const v = (i: number) => (labelVisible(s, (i % ORBIT_STEPS) / ORBIT_STEPS) ? 1 : 0);
  const stops: string[] = [];
  for (let i = 0; i <= TOTAL; i++) {
    if (i === 0 || i === TOTAL || v(i) !== v(i - 1) || v(i) !== v(i + 1)) stops.push(`${pct(i)}{opacity:${v(i)}}`);
  }
  return `@keyframes ${labelName(s)}{${stops.join("")}}`;
}

// 위성 자리 나누기 — 칸 n개(보이는 위성 + "+N") 중 i번째의 궤도·궤도 안 순번.
export function orbitAssign(cells: number): { orbit: 0 | 1; k: number; n: number }[] {
  const first = Math.min(cells, ORBIT_PER_RING);
  const second = cells - first;
  return Array.from({ length: cells }, (_, i) =>
    i < first ? { orbit: 0 as const, k: i, n: first } : { orbit: 1 as const, k: i - first, n: second },
  );
}
// 궤도 안 자리(0~1) — 두 번째 궤도는 반 칸 엇갈려 첫 궤도 위성과 같은 각도에 겹쳐 서지 않게.
export const orbitFrac = (a: { orbit: 0 | 1; k: number; n: number }) => ((a.k + (a.orbit ? 0.5 : 0)) / a.n) % 1;

// 문서 시계 기준 지연(ms, 음수) — 시각 now 에 붙이면 진행 = (now / 주기 + frac) mod 1(키프레임이 여러 바퀴라 한 벌 길이로 나머지).
export function orbitDelayMs(frac: number, nowMs: number): number {
  return -Math.round((nowMs % ORBIT_CYCLE_MS) + frac * ORBIT_PERIOD_MS);
}
// 시각 t 의 진행 — 위 지연으로 돌던 위성이 t 에 있는 자리.
export const orbitProgressAt = (frac: number, tMs: number) => ((tMs % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS + frac) % 1;

// 쓰는 행성 크기(이야기 128 · 시기 128/144/160) × 기울기 2 의 키프레임 + 표식 규칙 — 지도에 한 번 넣는다.
// 규칙: 쉴 때(화면 밖·움직이기 전) = 정지 자리(--rx·--ry · 이름표 --lo) · 펼침([data-open]) = 펼침 자리(--ex·--ey · 이름표 보임) ·
// 지도 [data-motion] 안 + 계 [data-orbit="on"] + 안 펼침 = 공전 · [data-motion="hold"] = 그 자리에서 멈춤(움직임 멈추기·전체 보기 배율).
export function orbitCss(planetDs: readonly number[]): string {
  const shapes = [...new Set(planetDs)].flatMap((d) => [orbitShape(d, 0), orbitShape(d, 1)]);
  const frames = shapes.map((s) => orbitKeyframes(s) + labelKeyframes(s)).join("");
  const run = `.space-map[data-motion] .orbit-sys[data-orbit="on"]:not([data-open])`;
  return (
    frames +
    `.orbit-sat{transform:translate(var(--rx),var(--ry))}` +
    `.orbit-lbl{opacity:var(--lo)}` +
    `.orbit-sys[data-open] .orbit-sat{transform:translate(var(--ex),var(--ey))}` +
    `.orbit-sys[data-open] .orbit-lbl{opacity:1}` +
    `${run} .orbit-sat{animation:var(--orb) ${ORBIT_CYCLE_MS}ms linear infinite}` +
    // 이름표 지연은 화면이 위성과 같은 값을 직접 붙인다(animation-delay: inherit 은 합성기로 못 넘겨 메인 스레드가 매 프레임 계산 —
    // U2 실측 100 노드 47~84 → 6~10ms/초, ui-space §7.2)
    `${run} .orbit-lbl{animation:var(--orbl) ${ORBIT_CYCLE_MS}ms linear infinite}` +
    // 멈춤은 공전 규칙과 같은 선택자(구체성 같음 · 뒤에 있어 이김 — 줄임 속성 animation 이 재생 상태를 되돌리지 않게)
    `.space-map[data-motion="hold"] .orbit-sys[data-orbit="on"]:not([data-open]) :is(.orbit-sat,.orbit-lbl){animation-play-state:paused}`
  );
}
