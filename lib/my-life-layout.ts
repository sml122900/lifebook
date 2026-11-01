// My Life 마인드맵 배치 — 순수 함수(DB·DOM·LLM 0). docs/phase/my-life-restructure.md §1 ·
// node-graph-self.md §6 2b.1 의 1·4 · 2b-3a 수정(고정 좌표 캔버스).
//
// 지도 = 고정 좌표계의 한 장(배율 1 = CSS px). 노드 크기·간격은 화면 크기·접힘·배율과 무관하다.
//   시간 줄기: 이야기·그때의 나 열 x 40~240 · 줄기 x 296 · 중심 노드 x 172~420(248×120, 전부 같은 크기).
//   간선 통로: x 420~520(노드 없음 — 이야기 → 인물·장소 간선이 지나감).
//   인물록: x 520~ (제목 → 모임 칩(4개 이상) → 모임 영역 1~3개 → 모임 없는 분), 장소록: 그 아래.
//   (2b-3a 의 "중심마다 오른쪽 사람·장소 가지"는 없앰 — 사람·장소는 인물록·장소록에 한 번씩만.)
// 겹침: 시간 줄기는 띠를 쌓기만 하고 배치 뒤 resolveOverlaps 로 한 번 더 검사·해소. 인물록·장소록은 x 520
//   오른쪽에만 놓여 시간 줄기와 가로로 만날 수 없고, 안쪽은 칸 격자(구성상 0). 모임 영역은 "각 칸이 자기 모임 영역
//   안·다른 모임 영역 밖"을 검사해 어긋나면 칸 사이를 넓혀 다시 배치한다(모양은 lib/my-life-group-shape.ts 한 곳).
// 글자 폭은 재지 않는다 — 노드 크기는 종류·작은 물방울 수로만, 글자는 CSS 줄 수 제한으로 맞춘다.
// 클라이언트에서도 쓰므로 prisma 를 import 하지 않는다(타입만).

import type { MyLifeData, MyLifeStory } from "./my-life";
import { GROUP_SHAPE, rectInsideShape, rectOutsideShape, shapeAround, SHAPE_PAD, type GroupShape, type GroupShapeKind, type Rect } from "./my-life-group-shape";

const PAD = 40;
const COL_W = 200;
const BRANCH_DX = 56; // 줄기 ↔ 이야기 열 안쪽 가장자리
const TRUNK_X = PAD + COL_W + BRANCH_DX;
const CENTER_W = 248;

export const L = {
  PAD,
  COL_W,
  BRANCH_DX,
  TRUNK_X,
  LEFT_X: PAD,
  TOP_PAD: 32,
  BOTTOM_PAD: 120, // 오른쪽 아래 떠 있는 비서 버튼(64px)에 마지막 노드가 가리지 않게
  CENTER_W,
  CENTER_H: 120,
  CENTER_RIGHT: TRUNK_X + CENTER_W / 2, // 420 — 시간 줄기 쪽 오른쪽 끝
  AFTER_CENTER: 24,
  BRANCH_GAP: 16,
  BAND_GAP: 48,
  FOLD_W: 220,
  FOLD_H: 56,
  FOLD_GAP: 12,
  YEAR_GAP_H: 40,
  YEAR_GAP_MIN: 10,
  STORY_PAD_X: 14,
  STORY_PAD_Y: 12,
  STORY_TAG_H: 28,
  STORY_TEXT_H: 52, // 18px · 줄 높이 26px · 2줄
  CHIP_H: 36,
  CHIP_GAP: 6,
  CHIP_TOP: 8,
  CHIP_MAX_ROWS: 2,
  EDGE_DY: 22, // 이야기 노드에서 간선이 나가는 높이(꼭지 자리)
  OVERLAP_GAP: 12, // 겹침 해소 때 띄우는 간격
  // 간선 통로·인물록·장소록
  CORRIDOR_X: 440,
  REGION_X: 520,
  ITEM_W: 184,
  ITEM_H: 56,
  ITEM_GAP: 12,
  GRID_COLS: 3,
  CELL_GAP: 2 * SHAPE_PAD + 8, // 56 — 한 영역의 안쪽 여백이 남의 칸에 닿지 않게(설계 g ≥ 2p + 8)
  TITLE_H: 48,
  SUBTITLE_H: 40,
  LABEL_H: 56, // 모임 이름 버튼
  LABEL_GAP: 8,
  GROUP_CHIP_H: 56,
  SECTION_GAP: 24,
  REGION_GAP: 64,
  EMPTY_GROUP_W: 200, // 아무도 없는 모임도 영역이 보이게
  EMPTY_GROUP_H: 80,
  MAX_SHOWN_GROUPS: 3,
  CHIP_ROW_MAX: 640,
} as const;

type Box = { key: string; x: number; y: number; w: number; h: number };

export type LayoutNode =
  | (Box & { kind: "event"; eventId: string })
  | (Box & {
      kind: "story";
      eventId: string;
      storyId: string;
      hasTag: boolean;
      chipRows: number[][]; // 이야기 chips 의 인덱스, 줄마다
      overflow: number; // 줄에 못 담은 작은 물방울 수("외 N")
    })
  | (Box & { kind: "fold"; eventId: string; count: number })
  | (Box & { kind: "gap"; years: number })
  | (Box & { kind: "person"; personId: string; hiddenGroups: number }) // hiddenGroups = 영역에 안 보이는 모임 수
  | (Box & { kind: "place"; placeId: string })
  | (Box & { kind: "groupLabel"; groupId: string })
  | (Box & { kind: "groupChip"; groupId: string; shown: boolean })
  | (Box & { kind: "title"; region: "people" | "places" })
  | (Box & { kind: "subtitle"; region: "people" | "places" });

export type LayoutShape = GroupShape & { groupId: string; index: number }; // index = 영역 안 순서(테두리 무늬 구분)
export type LayoutBand = { eventId: string; top: number; bottom: number; centerMidY: number };
export type TrunkSegment = { y1: number; y2: number; decade: number | null };
export type Edge = { x1: number; y1: number; x2: number; y2: number };

export type MyLifeLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: Edge[]; // 줄기 ↔ 이야기 이음선(늘 보임). 이야기 → 인물·장소 간선은 lib/my-life-edges(선택했을 때만)
  trunk: TrunkSegment[];
  bands: LayoutBand[];
  shapes: LayoutShape[];
  shownGroupIds: string[];
  regions: { timeline: Rect; people: Rect; places: Rect };
  cellGap: number; // 모임 영역 칸 사이(소속 검사로 넓혀졌으면 56 보다 큼)
  shifted: number; // 시간 줄기 겹침 해소로 내린 횟수(정상 배치 = 0)
};

// 지도 노드 수(중심 + 이야기 + 인물 + 장소, 작은 물방울 제외) — 접기 기본값(Q41)·성능 상한 기준.
export function countMapNodes(data: MyLifeData): number {
  return data.events.reduce((n, e) => n + 1 + e.stories.length, 0) + data.people.length + data.places.length;
}

// 이 수를 넘으면 처음부터 모든 띠를 접는다(Q41). 인물·장소는 접히지 않으므로 시간 줄기 노드만 센다.
export const FOLD_ALL_ABOVE = 60;
export function countTimelineNodes(data: MyLifeData): number {
  return data.events.reduce((n, e) => n + 1 + e.stories.length, 0);
}

const WIDE = /[ᄀ-ᇿ　-鿿가-힯豈-﫿＀-￯]/;

// 작은 물방울 폭 추정 — 한글·한자 등 18px, 그 밖 10px, + 좌우 여백 22 + 테두리 4.
export function estimateChipWidth(text: string): number {
  let w = 26;
  for (const ch of text) w += WIDE.test(ch) ? 18 : 10;
  return w;
}

export function overflowLabel(n: number): string {
  return `외 ${n}`;
}

// 작은 물방울을 줄에 담는다. 넘치면 마지막 줄 끝에 "외 N" 이 들어갈 자리를 비운다.
export function packChips(names: string[], rowWidth: number = L.COL_W - 2 * L.STORY_PAD_X): { rows: number[][]; overflow: number } {
  const rows: number[][] = [];
  const widths: number[] = [];
  let i = 0;
  for (; i < names.length; i++) {
    const w = Math.min(estimateChipWidth(names[i]), rowWidth);
    const last = rows.length - 1;
    if (last >= 0 && widths[last] + L.CHIP_GAP + w <= rowWidth) {
      rows[last].push(i);
      widths[last] += L.CHIP_GAP + w;
    } else if (rows.length < L.CHIP_MAX_ROWS) {
      rows.push([i]);
      widths.push(w);
    } else break;
  }
  let overflow = names.length - i;
  if (overflow > 0) {
    const last = rows.length - 1;
    // "외 N" 이 마지막 줄에 들어갈 때까지 끝에서 하나씩 뺀다(뺀 만큼 N 이 늘어남).
    while (rows[last].length > 0) {
      const tag = estimateChipWidth(overflowLabel(overflow));
      const used = rows[last].reduce((s, k) => s + Math.min(estimateChipWidth(names[k]), rowWidth), 0) + L.CHIP_GAP * (rows[last].length - 1);
      if (used + L.CHIP_GAP + tag <= rowWidth) break;
      rows[last].pop();
      overflow += 1;
    }
    // 마지막 줄이 비면 그 줄은 "외 N" 만 담는 줄로 남긴다(줄 수 = 높이라 지우지 않음).
  }
  return { rows, overflow };
}

// 꼬리표 줄(한 줄, 18px) — 그때의 나 > 확인 전 > 여러 시기 순으로 하나만 보인다(나머지는 패널·버튼 이름에).
export type StoryTag = "self" | "pending" | "elsewhere" | null;
export function storyTag(s: MyLifeStory): StoryTag {
  if (s.kind === "SELF") return "self";
  if (s.hasPending) return "pending";
  if (s.otherEventIds.length > 0) return "elsewhere";
  return null;
}
export function storyHasTag(s: MyLifeStory): boolean {
  return storyTag(s) !== null;
}

export function storyHeight(s: MyLifeStory): { h: number; rows: number[][]; overflow: number } {
  const { rows, overflow } = packChips(s.chips.map((c) => c.name));
  const lines = rows.length + (overflow > 0 && rows.length === 0 ? 1 : 0);
  const chipsH = lines > 0 ? L.CHIP_TOP + lines * L.CHIP_H + (lines - 1) * L.CHIP_GAP : 0;
  const h = L.STORY_PAD_Y * 2 + (storyHasTag(s) ? L.STORY_TAG_H : 0) + L.STORY_TEXT_H + chipsH;
  return { h, rows, overflow };
}

// 연대 스트립 색 단계 — 토큰은 1940~2020 년대만 있다.
export function decadeOf(year: number | null): number | null {
  if (year === null) return null;
  return Math.min(2020, Math.max(1940, Math.floor(year / 10) * 10));
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 노드 사각형끼리 겹치는 쌍(검사 — 회귀와 resolveOverlaps 가 같이 쓴다).
export function findOverlaps(nodes: readonly Box[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (intersects(nodes[i], nodes[j])) out.push([nodes[i].key, nodes[j].key]);
    }
  }
  return out;
}

const bboxOf = (rs: readonly Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

// ── 시간 줄기 ─────────────────────────────────────────────────────────

type Timeline = Pick<MyLifeLayout, "nodes" | "edges" | "trunk" | "bands" | "height" | "shifted">;

// 배치 후 겹침 해소 — 겹치는 쌍이 있으면 아래쪽 노드의 윗변 이하에 있는 모든 것(노드·이음선·줄기·띠)을
// 위 노드 아랫변 + 간격까지 내린다. 위아래 순서·좌우 위치는 그대로라 구조가 깨지지 않는다(시간 줄기 안에서만).
export function resolveOverlaps<T extends Timeline>(layout: T): T {
  const out: T = {
    ...layout,
    nodes: layout.nodes.map((n) => ({ ...n })),
    edges: layout.edges.map((e) => ({ ...e })),
    trunk: layout.trunk.map((t) => ({ ...t })),
    bands: layout.bands.map((b) => ({ ...b })),
  };
  for (let guard = 0; guard < 10_000; guard++) {
    let pair: [LayoutNode, LayoutNode] | null = null;
    for (let i = 0; i < out.nodes.length && !pair; i++) {
      for (let j = i + 1; j < out.nodes.length; j++) {
        if (intersects(out.nodes[i], out.nodes[j])) {
          pair = out.nodes[i].y <= out.nodes[j].y ? [out.nodes[i], out.nodes[j]] : [out.nodes[j], out.nodes[i]];
          break;
        }
      }
    }
    if (!pair) break;
    const [upper, lower] = pair;
    const from = lower.y;
    const dy = upper.y + upper.h + L.OVERLAP_GAP - lower.y;
    // 아래 노드 자신과 그보다 아래에 있는 것만 — 두 노드가 같은 높이면 위 노드까지 같이 내려가 끝없이 돌던 결함 방지.
    for (const n of out.nodes) if (n === lower || n.y > from) n.y += dy;
    for (const e of out.edges) {
      if (e.y1 >= from) e.y1 += dy;
      if (e.y2 >= from) e.y2 += dy;
    }
    for (const t of out.trunk) {
      if (t.y1 >= from) t.y1 += dy;
      if (t.y2 >= from) t.y2 += dy;
    }
    for (const b of out.bands) {
      if (b.top >= from) {
        b.top += dy;
        b.centerMidY += dy;
      }
      if (b.bottom >= from) b.bottom += dy;
    }
    out.height += dy;
    out.shifted += 1;
  }
  return out;
}

function layoutTimeline(data: MyLifeData, folded: ReadonlySet<string>): Timeline {
  const nodes: LayoutNode[] = [];
  const edges: Edge[] = [];
  const trunk: TrunkSegment[] = [];
  const bands: LayoutBand[] = [];
  let y = L.TOP_PAD;
  let prevYear: number | null = null;

  data.events.forEach((ev, idx) => {
    const segStart = y; // 줄기는 앞 띠 끝에서 이어진다(연도 간격 표지 뒤로도 끊기지 않게)
    if (idx > 0 && ev.year !== null && prevYear !== null && ev.year - prevYear >= L.YEAR_GAP_MIN) {
      nodes.push({ key: `gap:${ev.id}`, kind: "gap", years: ev.year - prevYear, x: L.TRUNK_X - L.FOLD_W / 2, y, w: L.FOLD_W, h: L.YEAR_GAP_H });
      y += L.YEAR_GAP_H + L.BRANCH_GAP;
    }
    if (ev.year !== null) prevYear = ev.year;

    const top = y;
    nodes.push({ key: `ev:${ev.id}`, kind: "event", eventId: ev.id, x: L.TRUNK_X - L.CENTER_W / 2, y, w: L.CENTER_W, h: L.CENTER_H });
    let bottom = y + L.CENTER_H;
    if (ev.stories.length > 0 && folded.has(ev.id)) {
      const fy = bottom + L.FOLD_GAP;
      nodes.push({ key: `fold:${ev.id}`, kind: "fold", eventId: ev.id, count: ev.stories.length, x: L.TRUNK_X - L.FOLD_W / 2, y: fy, w: L.FOLD_W, h: L.FOLD_H });
      bottom = fy + L.FOLD_H;
    } else if (ev.stories.length > 0) {
      let ly = bottom + L.AFTER_CENTER;
      for (const s of ev.stories) {
        const { h, rows, overflow } = storyHeight(s);
        nodes.push({ key: `st:${ev.id}:${s.id}`, kind: "story", eventId: ev.id, storyId: s.id, x: L.LEFT_X, y: ly, w: L.COL_W, h, hasTag: storyHasTag(s), chipRows: rows, overflow });
        edges.push({ x1: L.TRUNK_X, y1: ly + L.EDGE_DY, x2: L.LEFT_X + L.COL_W, y2: ly + L.EDGE_DY });
        ly += h + L.BRANCH_GAP;
      }
      bottom = ly - L.BRANCH_GAP;
    }
    bands.push({ eventId: ev.id, top, bottom, centerMidY: top + L.CENTER_H / 2 });
    trunk.push({ y1: segStart, y2: bottom + L.BAND_GAP, decade: decadeOf(ev.year) });
    y = bottom + L.BAND_GAP;
  });
  if (trunk.length > 0) trunk[trunk.length - 1].y2 = bands[bands.length - 1].bottom;
  return resolveOverlaps({ nodes, edges, trunk, bands, height: Math.max(y - L.BAND_GAP, L.TOP_PAD), shifted: 0 });
}

// ── 인물록·장소록(모임 영역) ────────────────────────────────────────────

// 칸 틀 — 영역에 보이는 모임 k 개(1~3)에서 소속 비트(모임 i = 1<<i) → [열, 줄]. 설계 §1.3.
const TEMPLATES: Record<number, Record<number, [number, number]>> = {
  1: { 1: [0, 0] },
  2: { 1: [0, 0], 3: [1, 0], 2: [2, 0] },
  3: { 1: [0, 0], 3: [1, 0], 2: [2, 0], 5: [0, 1], 7: [1, 1], 6: [2, 1], 4: [1, 2] },
};

// 칸 안 노드 격자 — 4개 이하 1열, 그 이상 2열.
function cellGrid(n: number): { cols: number; w: number; h: number } {
  const cols = n <= 4 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  return { cols, w: cols * L.ITEM_W + (cols - 1) * L.ITEM_GAP, h: rows * L.ITEM_H + (rows - 1) * L.ITEM_GAP };
}

function labelWidth(name: string): number {
  return Math.min(320, Math.max(96, estimateChipWidth(name) + 24));
}

type Item = { id: string; groupIds: string[] };
type VennOut = { pos: Map<string, Rect>; shapes: LayoutShape[]; gap: number };

// 모임 영역 배치(원점 0,0 기준 — 부르는 쪽이 옮긴다). 소속 검사가 어긋나면 칸 사이를 넓혀 다시.
function placeVenn(items: Item[], shown: string[], kind: GroupShapeKind): VennOut {
  const k = shown.length;
  const tpl = TEMPLATES[k];
  const bySig = new Map<number, string[]>();
  for (const it of items) {
    let sig = 0;
    shown.forEach((g, i) => {
      if (it.groupIds.includes(g)) sig |= 1 << i;
    });
    if (sig === 0) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig)!.push(it.id);
  }
  // 아무도 없는 모임은 자기 "만" 칸을 빈 상자로 잡아 영역이 보이게.
  const reserved = new Set<number>();
  shown.forEach((_, i) => {
    const bit = 1 << i;
    if (![...bySig.keys()].some((s) => s & bit)) reserved.add(bit);
  });

  for (let gap = L.CELL_GAP; gap <= L.CELL_GAP + 24 * 20; gap += 24) {
    const size = new Map<number, { w: number; h: number; cols: number }>();
    for (const [sig, ids] of bySig) size.set(sig, cellGrid(ids.length));
    for (const sig of reserved) size.set(sig, { w: L.EMPTY_GROUP_W, h: L.EMPTY_GROUP_H, cols: 1 });
    const colW = [0, 0, 0];
    const rowH = [0, 0, 0];
    for (const [sig, s] of size) {
      const [c, r] = tpl[sig];
      colW[c] = Math.max(colW[c], s.w);
      rowH[r] = Math.max(rowH[r], s.h);
    }
    const xs = [0, colW[0] + gap, colW[0] + colW[1] + 2 * gap];
    const ys = [0, rowH[0] + gap, rowH[0] + rowH[1] + 2 * gap];
    const cellRect = new Map<number, Rect>();
    for (const [sig, s] of size) {
      const [c, r] = tpl[sig];
      cellRect.set(sig, { x: xs[c] + (colW[c] - s.w) / 2, y: ys[r] + (rowH[r] - s.h) / 2, w: s.w, h: s.h });
    }
    const pos = new Map<string, Rect>();
    for (const [sig, ids] of bySig) {
      const cr = cellRect.get(sig)!;
      const { cols } = size.get(sig)!;
      ids.forEach((id, j) => {
        pos.set(id, { x: cr.x + (j % cols) * (L.ITEM_W + L.ITEM_GAP), y: cr.y + Math.floor(j / cols) * (L.ITEM_H + L.ITEM_GAP), w: L.ITEM_W, h: L.ITEM_H });
      });
    }
    const shapes: LayoutShape[] = shown.map((groupId, i) => {
      const bit = 1 << i;
      const cells = [...cellRect.entries()].filter(([sig]) => sig & bit).map(([, r]) => r);
      return { ...shapeAround(bboxOf(cells), kind), groupId, index: i };
    });
    // 소속 검사 — 칸의 노드(빈 모임 상자 포함)는 자기 모임 영역 안·다른 모임 영역 밖.
    let ok = true;
    for (const [sig, cr] of cellRect) {
      const rects = reserved.has(sig) ? [cr] : (bySig.get(sig) ?? []).map((id) => pos.get(id)!);
      for (const r of rects) {
        shapes.forEach((s, i) => {
          const member = (sig & (1 << i)) !== 0;
          if (member ? !rectInsideShape(s, r) : !rectOutsideShape(s, r)) ok = false;
        });
      }
    }
    if (!ok) continue;
    return { pos, shapes, gap };
  }
  throw new Error("모임 영역 배치 실패 — 칸 사이를 넓혀도 소속이 어긋남");
}

type RegionOut = { nodes: LayoutNode[]; shapes: LayoutShape[]; rect: Rect };

// 모임 이름 버튼 — 1번째 위 왼쪽, 2번째 위 오른쪽, 3번째 아래 가운데. 위 둘이 겹치면 2번째를 한 줄 위로.
function placeLabels(shapes: LayoutShape[], names: Map<string, string>): { groupId: string; rect: Rect }[] {
  const out: { groupId: string; rect: Rect }[] = [];
  shapes.forEach((s, i) => {
    const w = labelWidth(names.get(s.groupId) ?? "");
    if (i === 0) out.push({ groupId: s.groupId, rect: { x: s.x + 8, y: s.y - L.LABEL_H - L.LABEL_GAP, w, h: L.LABEL_H } });
    else if (i === 1) {
      let r: Rect = { x: s.x + s.w - 8 - w, y: s.y - L.LABEL_H - L.LABEL_GAP, w, h: L.LABEL_H };
      if (out.some((o) => intersects(o.rect, r))) r = { ...r, y: r.y - L.LABEL_H - L.LABEL_GAP };
      out.push({ groupId: s.groupId, rect: r });
    } else out.push({ groupId: s.groupId, rect: { x: s.x + s.w / 2 - w / 2, y: s.y + s.h + L.LABEL_GAP, w, h: L.LABEL_H } });
  });
  return out;
}

// 한 영역(인물록 또는 장소록) — 제목 → (모임 칩) → 모임 영역 → (소제목) 무소속 격자.
function layoutRegion(
  region: "people" | "places",
  items: (Item & { kind: "person" | "place"; extraKey?: number })[],
  groups: { id: string; name: string; memberIds: string[] }[],
  shownIn: readonly string[],
  top: number,
  kind: GroupShapeKind,
): RegionOut & { shownGroupIds: string[]; cellGap: number } {
  const x0 = L.REGION_X;
  const nodes: LayoutNode[] = [];
  const shapes: LayoutShape[] = [];
  let y = top;
  nodes.push({ key: `title:${region}`, kind: "title", region, x: x0, y, w: 240, h: L.TITLE_H });
  y += L.TITLE_H + L.SECTION_GAP;

  // 영역에 보일 모임 — 고른 것(있으면) 우선, 모자라면 인원 많은 순, 최대 3개(Q52).
  const valid = new Set(groups.map((g) => g.id));
  const bySize = [...groups].sort((a, b) => b.memberIds.length - a.memberIds.length || a.name.localeCompare(b.name, "ko"));
  const shown = [...new Set([...shownIn.filter((id) => valid.has(id)), ...bySize.map((g) => g.id)])].slice(0, L.MAX_SHOWN_GROUPS);

  // 모임 4개 이상 — 영역에 보일 모임을 고르는 칩 줄.
  if (groups.length > L.MAX_SHOWN_GROUPS) {
    let cx = x0;
    for (const g of groups) {
      const w = labelWidth(g.name) + 32; // "✓" 자리
      if (cx > x0 && cx + w > x0 + L.CHIP_ROW_MAX) {
        cx = x0;
        y += L.GROUP_CHIP_H + L.ITEM_GAP;
      }
      nodes.push({ key: `gc:${g.id}`, kind: "groupChip", groupId: g.id, shown: shown.includes(g.id), x: cx, y, w, h: L.GROUP_CHIP_H });
      cx += w + L.ITEM_GAP;
    }
    y += L.GROUP_CHIP_H + L.SECTION_GAP;
  }

  let cellGap: number = L.CELL_GAP;
  const placedIds = new Set<string>();
  if (shown.length > 0) {
    const v = placeVenn(items, shown, kind);
    cellGap = v.gap;
    const names = new Map(groups.map((g) => [g.id, g.name]));
    const labels = placeLabels(v.shapes, names);
    const all = [...v.shapes, ...labels.map((l) => l.rect)];
    const bb = bboxOf(all);
    const dx = x0 - bb.x;
    const dy = y - bb.y;
    for (const s of v.shapes) shapes.push({ ...s, x: s.x + dx, y: s.y + dy });
    for (const l of labels) nodes.push({ key: `gl:${l.groupId}`, kind: "groupLabel", groupId: l.groupId, x: l.rect.x + dx, y: l.rect.y + dy, w: l.rect.w, h: l.rect.h });
    for (const it of items) {
      const p = v.pos.get(it.id);
      if (!p) continue;
      placedIds.add(it.id);
      const hiddenGroups = it.groupIds.filter((g) => !shown.includes(g)).length;
      nodes.push(
        it.kind === "person"
          ? { key: `pe:${it.id}`, kind: "person", personId: it.id, hiddenGroups, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h }
          : { key: `pl:${it.id}`, kind: "place", placeId: it.id, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h },
      );
    }
    y += bb.h + L.SECTION_GAP;
  }

  // 무소속(영역에 보이는 모임에 하나도 안 속한 것) 격자.
  const rest = items.filter((it) => !placedIds.has(it.id));
  if (rest.length > 0) {
    if (groups.length > 0) {
      nodes.push({ key: `sub:${region}`, kind: "subtitle", region, x: x0, y, w: 240, h: L.SUBTITLE_H });
      y += L.SUBTITLE_H + L.ITEM_GAP;
    }
    rest.forEach((it, j) => {
      const x = x0 + (j % L.GRID_COLS) * (L.ITEM_W + L.ITEM_GAP);
      const yy = y + Math.floor(j / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP);
      const hiddenGroups = it.groupIds.filter((g) => !shown.includes(g)).length;
      nodes.push(
        it.kind === "person"
          ? { key: `pe:${it.id}`, kind: "person", personId: it.id, hiddenGroups, x, y: yy, w: L.ITEM_W, h: L.ITEM_H }
          : { key: `pl:${it.id}`, kind: "place", placeId: it.id, x, y: yy, w: L.ITEM_W, h: L.ITEM_H },
      );
    });
    y += Math.ceil(rest.length / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP) - L.ITEM_GAP;
  }
  const rect = bboxOf([...nodes, ...shapes]);
  return { nodes, shapes, rect, shownGroupIds: shown, cellGap };
}

export function layoutMyLife(
  data: MyLifeData,
  // shapeKind — 회귀가 원 모양으로도 소속 검사를 돌릴 때만. 화면은 결정 지점(GROUP_SHAPE) 그대로.
  opts: { folded?: ReadonlySet<string>; shownGroupIds?: readonly string[]; shapeKind?: GroupShapeKind } = {},
): MyLifeLayout {
  const kind = opts.shapeKind ?? GROUP_SHAPE;
  const t = layoutTimeline(data, opts.folded ?? new Set<string>());
  const people = layoutRegion(
    "people",
    // 확인 대기 초안은 모임에 넣지 않고 맨 끝(무소속 격자의 끝)에.
    [...data.people.filter((p) => !p.draft), ...data.people.filter((p) => p.draft)].map((p) => ({ id: p.id, groupIds: p.draft ? [] : p.groupIds, kind: "person" as const })),
    data.groups,
    opts.shownGroupIds ?? [],
    L.TOP_PAD,
    kind,
  );
  const places = layoutRegion(
    "places",
    data.places.map((p) => ({ id: p.id, groupIds: [], kind: "place" as const })),
    [], // 장소 묶음은 3단계(PlaceGroup)
    [],
    people.rect.y + people.rect.h + L.REGION_GAP,
    kind,
  );
  const timelineRect: Rect = { x: L.LEFT_X, y: L.TOP_PAD, w: L.CENTER_RIGHT - L.LEFT_X, h: Math.max(t.height - L.TOP_PAD, L.CENTER_H) };
  const nodes = [...t.nodes, ...people.nodes, ...places.nodes];
  const shapes = [...people.shapes, ...places.shapes];
  const right = bboxOf([...nodes, ...shapes, timelineRect]);
  return {
    width: right.x + right.w + L.PAD,
    height: Math.max(t.height, places.rect.y + places.rect.h) + L.BOTTOM_PAD,
    nodes,
    edges: t.edges,
    trunk: t.trunk,
    bands: t.bands,
    shapes,
    shownGroupIds: people.shownGroupIds,
    regions: { timeline: timelineRect, people: people.rect, places: places.rect },
    cellGap: people.cellGap,
    shifted: t.shifted,
  };
}

// 화면 가운데(세계 y)에 가장 가까운 띠 — "지금 보는 곳"·중심 테두리 강조.
export function bandAt(layout: Pick<MyLifeLayout, "bands">, worldY: number): LayoutBand | null {
  let best: LayoutBand | null = null;
  let bestD = Infinity;
  for (const b of layout.bands) {
    const d = worldY < b.top ? b.top - worldY : worldY > b.bottom ? worldY - b.bottom : 0;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
