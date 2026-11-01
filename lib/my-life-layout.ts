// My Life 마인드맵 배치 — 순수 함수(DB·DOM·LLM 0). docs/phase/node-graph-self.md §6 2b.1 의 1·4.
//
// 지도 = 고정 좌표계의 한 장(배율 1 = CSS px). 노드 크기·간격은 이 좌표로 고정 — 화면 크기·접힘·배율과
// 무관하다(2026-11-01 운영 폰 피드백 후 자유 이동 캔버스로 바꿈 — 화면 폭에 맞춘 342 폭은 폐기).
//   왼쪽 열 x 40~240(이야기·그때의 나) · 줄기 x 296 · 오른쪽 열 x 352~552(사람·모임·장소) · 폭 592.
//   가지는 줄기에서 56px 떨어져 이음선으로 이어진다.
// 띠(중심 1개)를 위에서 아래로 쌓고, 열 안의 노드도 세로로 쌓는다 — 중심 사이 간격은 그 사이 가지 높이만큼
// 늘어난다. 배치가 끝나면 노드 사각형끼리 겹침을 검사하고, 겹치면 아래 것과 그 밑 전부를 내려 해소한다
// (resolveOverlaps — 구성상 0 이어야 하지만 코드로 보장).
// 중심 노드는 연도 모름·접힘·가지 없음과 무관하게 전부 같은 크기·같은 모양이다.
// 글자 폭은 재지 않는다 — 노드 크기는 종류·작은 물방울 수로만 정하고, 글자는 CSS 줄 수 제한으로 맞춘다.
// 작은 물방울만 이름 글자 수로 폭을 추정해 줄을 나눈다(줄 수가 높이를 정하므로 추정값으로 고정).
// 클라이언트에서도 쓰므로 prisma 를 import 하지 않는다(타입만).

import type { MyLifeData, MyLifeStory } from "./my-life";

const PAD = 40;
const COL_W = 200;
const BRANCH_DX = 56; // 줄기 ↔ 가지 열 안쪽 가장자리
const TRUNK_X = PAD + COL_W + BRANCH_DX;

export const L = {
  PAD,
  COL_W,
  BRANCH_DX,
  TRUNK_X,
  WORLD_W: TRUNK_X * 2,
  LEFT_X: PAD,
  RIGHT_X: TRUNK_X + BRANCH_DX,
  TOP_PAD: 32,
  BOTTOM_PAD: 120, // 오른쪽 아래 떠 있는 비서 버튼(64px)에 마지막 노드가 가리지 않게
  CENTER_W: 248,
  CENTER_H: 120,
  AFTER_CENTER: 24,
  BRANCH_GAP: 16,
  BAND_GAP: 48,
  BRANCH_H: 64,
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
  EDGE_DY: 22, // 가지 이음선이 노드 위에서 내려오는 높이(꼭지 자리)
  OVERLAP_GAP: 12, // 겹침 해소 때 띄우는 간격
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
  | (Box & { kind: "branch"; eventId: string; branchIndex: number })
  | (Box & { kind: "fold"; eventId: string; count: number })
  | (Box & { kind: "gap"; years: number });

export type LayoutBand = { eventId: string; top: number; bottom: number; centerMidY: number };
export type TrunkSegment = { y1: number; y2: number; decade: number | null };
export type Edge = { x1: number; y1: number; x2: number; y2: number };

export type MyLifeLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: Edge[];
  trunk: TrunkSegment[];
  bands: LayoutBand[];
  shifted: number; // 겹침 해소로 내린 횟수(정상 배치 = 0)
};

// 지도 노드 수(중심 + 가지, 작은 물방울 제외) — 접기 기본값(Q41)·성능 상한 기준.
export function countMapNodes(data: MyLifeData): number {
  return data.events.reduce((n, e) => n + 1 + e.stories.length + e.branches.length, 0);
}

// 이 수를 넘으면 처음부터 모든 띠를 접는다(Q41 — 성능 상한 실측의 절반으로 조정).
export const FOLD_ALL_ABOVE = 60;

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

// 이야기 노드 글자 — 본문 첫 문장(제목 칸이 없음 — Q46). 화면은 2줄에서 자른다.
export function storyLead(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  const m = t.match(/^(.+?[.!?。])(\s|$)/);
  return m ? m[1] : t;
}

// 연대 스트립 색 단계 — 토큰은 1940~2020 년대만 있다.
export function decadeOf(year: number | null): number | null {
  if (year === null) return null;
  return Math.min(2020, Math.max(1940, Math.floor(year / 10) * 10));
}

const intersects = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

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

// 배치 후 겹침 해소 — 겹치는 쌍이 있으면 아래쪽 노드의 윗변 이하에 있는 모든 것(노드·이음선·줄기·띠)을
// 위 노드 아랫변 + 간격까지 내린다. 위아래 순서·좌우 위치는 그대로라 구조가 깨지지 않는다.
export function resolveOverlaps(layout: MyLifeLayout): MyLifeLayout {
  const out: MyLifeLayout = {
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
    for (const n of out.nodes) if (n.y >= from) n.y += dy;
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

export function layoutMyLife(data: MyLifeData, opts: { folded?: ReadonlySet<string> } = {}): MyLifeLayout {
  const folded = opts.folded ?? new Set<string>();
  const nodes: LayoutNode[] = [];
  const edges: Edge[] = [];
  const trunk: TrunkSegment[] = [];
  const bands: LayoutBand[] = [];
  let y = L.TOP_PAD;
  let prevYear: number | null = null;

  data.events.forEach((ev, idx) => {
    const segStart = y; // 줄기는 앞 띠 끝에서 이어진다(연도 간격 표지 뒤로도 끊기지 않게)
    // 앞 띠와 10년 이상 떨어졌으면 줄기 위 표지.
    if (idx > 0 && ev.year !== null && prevYear !== null && ev.year - prevYear >= L.YEAR_GAP_MIN) {
      nodes.push({ key: `gap:${ev.id}`, kind: "gap", years: ev.year - prevYear, x: L.TRUNK_X - L.FOLD_W / 2, y, w: L.FOLD_W, h: L.YEAR_GAP_H });
      y += L.YEAR_GAP_H + L.BRANCH_GAP;
    }
    if (ev.year !== null) prevYear = ev.year;

    const top = y;
    nodes.push({ key: `ev:${ev.id}`, kind: "event", eventId: ev.id, x: L.TRUNK_X - L.CENTER_W / 2, y, w: L.CENTER_W, h: L.CENTER_H });
    const branchCount = ev.stories.length + ev.branches.length;
    let bottom = y + L.CENTER_H;

    if (branchCount > 0 && folded.has(ev.id)) {
      const fy = bottom + L.FOLD_GAP;
      nodes.push({ key: `fold:${ev.id}`, kind: "fold", eventId: ev.id, count: branchCount, x: L.TRUNK_X - L.FOLD_W / 2, y: fy, w: L.FOLD_W, h: L.FOLD_H });
      bottom = fy + L.FOLD_H;
    } else if (branchCount > 0) {
      const start = bottom + L.AFTER_CENTER;
      let ly = start;
      for (const s of ev.stories) {
        const { h, rows, overflow } = storyHeight(s);
        nodes.push({ key: `st:${ev.id}:${s.id}`, kind: "story", eventId: ev.id, storyId: s.id, x: L.LEFT_X, y: ly, w: L.COL_W, h, hasTag: storyHasTag(s), chipRows: rows, overflow });
        edges.push({ x1: L.TRUNK_X, y1: ly + L.EDGE_DY, x2: L.LEFT_X + L.COL_W, y2: ly + L.EDGE_DY });
        ly += h + L.BRANCH_GAP;
      }
      let ry = start;
      ev.branches.forEach((b, bi) => {
        nodes.push({ key: `br:${ev.id}:${b.kind}:${b.id}`, kind: "branch", eventId: ev.id, branchIndex: bi, x: L.RIGHT_X, y: ry, w: L.COL_W, h: L.BRANCH_H });
        edges.push({ x1: L.TRUNK_X, y1: ry + L.EDGE_DY, x2: L.RIGHT_X, y2: ry + L.EDGE_DY });
        ry += L.BRANCH_H + L.BRANCH_GAP;
      });
      bottom = Math.max(ly, ry) - L.BRANCH_GAP;
    }

    bands.push({ eventId: ev.id, top, bottom, centerMidY: top + L.CENTER_H / 2 });
    trunk.push({ y1: segStart, y2: bottom + L.BAND_GAP, decade: decadeOf(ev.year) });
    y = bottom + L.BAND_GAP;
  });

  // 마지막 띠의 줄기는 그 띠 바닥에서 끝낸다.
  if (trunk.length > 0) trunk[trunk.length - 1].y2 = bands[bands.length - 1].bottom;
  const raw: MyLifeLayout = { width: L.WORLD_W, height: y - L.BAND_GAP + L.BOTTOM_PAD, nodes, edges, trunk, bands, shifted: 0 };
  return resolveOverlaps(raw);
}

// 화면 가운데(세계 y)에 가장 가까운 띠 — "지금 보는 곳"·중심 테두리 강조.
export function bandAt(layout: MyLifeLayout, worldY: number): LayoutBand | null {
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
