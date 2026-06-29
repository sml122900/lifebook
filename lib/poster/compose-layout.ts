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

// ── 시대 대사건 배치 (기능2b) ────────────────────────────────────────
// 대사건은 노드(개인 사건) "사이" 시간순 위치에 강 중앙으로 얹는다. 노드 y 는
// 연도가 아닌 *순서(index)* 로 linspace 배치되므로, 대사건 연도를 노드의
// (연도→cy) 점들로 선형보간해 같은 시간 흐름 위에 놓되 —
// ★ 각 대사건은 어떤 노드 bbox 와도 ERA_NODE_PAD 이내로 겹치지 않게 밀어낸다.
// (연도 ON 이면 노드 bbox 가 연도줄 포함해 커지므로 그 전체를 회피.)
export const ERA_MIN_GAP = 32; // 대사건 간 최소 세로 간격
export const ERA_NODE_PAD = 40; // 노드 bbox 위·아래로 확보할 여백
export const ERA_Y_TOP = 180; // 상단 클램프(타이틀 밴드 170 아래)
export const ERA_Y_BOTTOM = 1410; // 하단 클램프(푸터 1448 위)

export type EraPos = { id: string; year: number; title: string; x: number; y: number };
// 노드 회피 정보 — cy=중심(보간용), top/bottom=실측 bbox(연도 ON 시 연도줄 포함).
export type EraNode = { year: number; cy: number; top: number; bottom: number };

export function placeEraEvents(
  nodes: EraNode[],
  events: { id: string; year: number; title: string }[],
): EraPos[] {
  if (events.length === 0) return [];
  const pts = nodes
    .filter((n) => Number.isFinite(n.year))
    .sort((a, b) => a.year - b.year);
  // 회피 구간 = 각 노드 bbox 를 PAD 만큼 넓힌 [top-PAD, bottom+PAD].
  const bands = nodes.map((n) => ({
    top: n.top - ERA_NODE_PAD,
    bottom: n.bottom + ERA_NODE_PAD,
  }));

  // 연도 → 노드 사이 보간 y(노드 cy 기준).
  const yForYear = (year: number): number => {
    if (pts.length === 0) return NODE_Y_TOP;
    if (pts.length === 1) return pts[0].cy;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (year <= first.year) {
      const slope = (pts[1].cy - first.cy) / Math.max(1, pts[1].year - first.year);
      return first.cy + (year - first.year) * slope;
    }
    if (year >= last.year) {
      const prev = pts[pts.length - 2];
      const slope = (last.cy - prev.cy) / Math.max(1, last.year - prev.year);
      return last.cy + (year - last.year) * slope;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (year >= a.year && year <= b.year) {
        const t = b.year === a.year ? 0.5 : (year - a.year) / (b.year - a.year);
        return a.cy + (b.cy - a.cy) * t;
      }
    }
    return last.cy;
  };

  // y 가 노드 band 안이면 band 밖으로(아래/위). 연쇄 band 대비 반복(단조 → 종료).
  const pushDown = (y0: number): number => {
    let y = y0, moved = true;
    while (moved) {
      moved = false;
      for (const b of bands) if (y > b.top && y < b.bottom) { y = b.bottom; moved = true; }
    }
    return y;
  };
  const pushUp = (y0: number): number => {
    let y = y0, moved = true;
    while (moved) {
      moved = false;
      for (const b of bands) if (y > b.top && y < b.bottom) { y = b.top; moved = true; }
    }
    return y;
  };

  const items: EraPos[] = events
    .map((e) => ({ id: e.id, year: e.year, title: e.title, x: 0, y: yForYear(e.year) }))
    .sort((a, b) => a.year - b.year);

  // ① 정방향(위→아래): 노드 band 회피 + 대사건 최소간격. 단조 증가라 종료 보장.
  let cursor = ERA_Y_TOP;
  for (const it of items) {
    it.y = pushDown(Math.max(it.y, cursor));
    cursor = it.y + ERA_MIN_GAP;
  }
  // ② 가벼운 하단 넘침 → 역방향(아래→위) 압축: band 회피 유지하며 위로 당김.
  if (items[items.length - 1].y > ERA_Y_BOTTOM) {
    let c2 = ERA_Y_BOTTOM;
    for (let i = items.length - 1; i >= 0; i--) {
      items[i].y = pushUp(Math.min(items[i].y, c2));
      c2 = items[i].y - ERA_MIN_GAP;
    }
  }
  // ③ 그래도 안 맞으면(상단 넘침·간격 붕괴 = 과밀, 보통 높은 티어) → 노드 회피·
  //    정확 위치를 포기하고 [TOP, BOTTOM] 균등 분산. ★우선순위: 대사건끼리 겹침
  //    방지(읽힘). 대사건은 강 중앙, 노드는 ±200 오프셋이라 같은 y 라도 가로로 안
  //    겹쳐 노드 회피를 포기해도 실제 겹침은 없고 여백만 줄어든다(티어·빼기로 조절).
  let minGap = Infinity;
  for (let i = 1; i < items.length; i++) minGap = Math.min(minGap, items[i].y - items[i - 1].y);
  if (items[0].y < ERA_Y_TOP - 0.5 || minGap < ERA_MIN_GAP - 0.5) {
    const n = items.length;
    for (let i = 0; i < n; i++) {
      items[i].y =
        n === 1
          ? (ERA_Y_TOP + ERA_Y_BOTTOM) / 2
          : ERA_Y_TOP + ((ERA_Y_BOTTOM - ERA_Y_TOP) * i) / (n - 1);
    }
  }
  for (const it of items) it.x = riverX(it.y);
  return items;
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
