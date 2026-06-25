// P4 — 포스터 합성 레이아웃 (순수 함수, DOM 무관).
//
// compose_print.py(PIL) 의 배치 알고리즘을 포팅. 실측(getBBox)·luminance 는
// 브라우저에서만 가능하므로 여기선 *측정값을 받아* 좌표를 계산하는 순수
// 로직만 담는다(테스트 가능). 측정·렌더는 클라이언트(PosterCompose).

export const POSTER_W = 1037;
export const POSTER_H = 1517;
export const CLAMP_MARGIN = 150; // 주석의 110 무시(명세 확정)

// 강 polyline 12점. river_x(y) = 선형보간.
export const RIVER_POINTS: ReadonlyArray<readonly [number, number]> = [
  [520, 90], [555, 200], [600, 320], [545, 440], [600, 560], [560, 680],
  [600, 800], [540, 920], [560, 1040], [540, 1160], [515, 1280], [500, 1380],
];

export function riverX(y: number): number {
  const pts = RIVER_POINTS;
  if (y <= pts[0][1]) return pts[0][0];
  const last = pts[pts.length - 1];
  if (y >= last[1]) return last[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (y >= y1 && y <= y2) {
      const t = y2 === y1 ? 0 : (y - y1) / (y2 - y1);
      return x1 + (x2 - x1) * t;
    }
  }
  return last[0];
}

export function linspace(a: number, b: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(a + b) / 2];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * (i / (n - 1)));
  return out;
}

// ── 노드 배치 ────────────────────────────────────────────────────────
// y = linspace(200,1300,N), 좌우교대(i짝수=왼쪽), cx = river_x(y) ∓ 200,
// clamp cx ∈ [150+boxW/2, 1037-150-boxW/2]. boxW/boxH 는 클라가 실측해 전달.
export const NODE_Y_TOP = 200;
export const NODE_Y_BOT = 1300;
export const NODE_OFFSET = 200;

export type NodeBox = { boxW: number; boxH: number };
export type NodePos = { cx: number; cy: number; boxW: number; boxH: number };

export function placeNodes(boxes: NodeBox[]): NodePos[] {
  const ys = linspace(NODE_Y_TOP, NODE_Y_BOT, boxes.length);
  return boxes.map((b, i) => {
    const cy = ys[i];
    const side = i % 2 === 0 ? -1 : 1; // 짝수=왼쪽
    let cx = riverX(cy) + side * NODE_OFFSET;
    const minX = CLAMP_MARGIN + b.boxW / 2;
    const maxX = POSTER_W - CLAMP_MARGIN - b.boxW / 2;
    cx = Math.max(minX, Math.min(maxX, cx));
    return { cx, cy, boxW: b.boxW, boxH: b.boxH };
  });
}

// ── 메모 배치 ────────────────────────────────────────────────────────
// 좌우 균등분배(ceil(N/2) 좌). 각 단 y=linspace(범위고정, 개수유동).
// 좌 205~1130 / 우 250~1095. 좌 x=34 start max165 / 우 x=1037-34 end max160.
export const MEMO_LEFT_X = 34;
export const MEMO_RIGHT_X = POSTER_W - 34;
export const MEMO_LEFT_MAXW = 165;
export const MEMO_RIGHT_MAXW = 160;
export const MEMO_LEFT_Y0 = 205;
export const MEMO_LEFT_Y1 = 1130;
export const MEMO_RIGHT_Y0 = 250;
export const MEMO_RIGHT_Y1 = 1095;
export const MEMO_MAX = 20; // 좌10+우10

// 메모 톤 3색 순환(먹/세이지/브라운블루). MEMO_COLORS·force_white 는 죽은 코드 → 무시.
export const MEMO_TONE = ["#3A332B", "#48543E", "#404C5A"] as const;
export const LUM_THRESHOLD = 150;
export const LIGHT_TEXT = "#F8F3E6";

export type MemoSlot = {
  memoIndex: number; // memos 배열 인덱스(색 순환·회전 seed)
  side: "left" | "right";
  x: number;
  anchor: "start" | "end";
  maxW: number;
  y: number;
};

export function distributeMemos(count: number): MemoSlot[] {
  const leftN = Math.ceil(count / 2);
  const rightN = count - leftN;
  const leftYs = linspace(MEMO_LEFT_Y0, MEMO_LEFT_Y1, leftN);
  const rightYs = linspace(MEMO_RIGHT_Y0, MEMO_RIGHT_Y1, rightN);
  const slots: MemoSlot[] = [];
  for (let i = 0; i < leftN; i++) {
    slots.push({ memoIndex: i, side: "left", x: MEMO_LEFT_X, anchor: "start", maxW: MEMO_LEFT_MAXW, y: leftYs[i] });
  }
  for (let i = 0; i < rightN; i++) {
    slots.push({ memoIndex: leftN + i, side: "right", x: MEMO_RIGHT_X, anchor: "end", maxW: MEMO_RIGHT_MAXW, y: rightYs[i] });
  }
  return slots;
}

export function memoTone(memoIndex: number): string {
  return MEMO_TONE[memoIndex % MEMO_TONE.length];
}

// 회전 ±2° — index 로 결정적(재렌더 일관, seed 고정).
export function seededRotation(memoIndex: number): number {
  // 0..1 의사난수(결정적). 정수 해시.
  const h = ((memoIndex * 2654435761) >>> 0) % 10000;
  return (h / 10000) * 4 - 2; // -2 .. +2
}

// 겹침 가드 — 같은 단 인접 메모의 (y 간격) 이 (그 메모 높이 + lineHeight*0.5)
// 보다 좁으면 빠듯 신호. heights = 각 슬롯의 실측 텍스트 높이(클라 전달).
export function detectMemoCrowding(
  slots: MemoSlot[],
  heights: number[],
  lineHeight: number,
): boolean {
  for (const side of ["left", "right"] as const) {
    const idxs = slots
      .map((s, i) => ({ s, i }))
      .filter((o) => o.s.side === side)
      .sort((a, b) => a.s.y - b.s.y);
    for (let k = 0; k < idxs.length - 1; k++) {
      const cur = idxs[k];
      const next = idxs[k + 1];
      const gap = next.s.y - cur.s.y;
      if (gap < heights[cur.i] + lineHeight * 0.5) return true;
    }
  }
  return false;
}
