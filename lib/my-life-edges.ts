// My Life 간선 — 선택한 노드의 이야기 → 인물·장소(그리고 중심 직접 연결) 간선만. 순수(클라이언트도 씀).
// docs/phase/my-life-restructure.md §1.4·§1.5.
//
// 경로: 이야기(또는 중심) 오른쪽 끝에서 수평으로 통로(x 440)까지 → 3차 베지어로 인물·장소 노드 왼쪽 가운데.
//   이야기 노드의 높이에는 띠 쌓기 구성상 중심 노드·펼치기 버튼·10년 표지가 없어 줄기를 가로질러도 중심 노드를
//   지나지 않는다. 제어점 x 를 통로~끝점 사이에 두어 곡선이 시간 줄기 쪽(x < 440)으로 돌아가지 않는다.

import type { MyLifeData } from "./my-life";
import { L, type LayoutNode, type MyLifeLayout } from "./my-life-layout";
import type { Rect } from "./my-life-group-shape";

export type EdgeKind = "person" | "place";
export type MapEdge = { from: string; to: string; kind: EdgeKind; d: string };
export type EdgeToggles = { person: boolean; place: boolean };

export function edgeStart(from: Rect, fromKind: "story" | "event"): { x: number; y: number } {
  return fromKind === "event" ? { x: from.x + from.w, y: from.y + from.h / 2 } : { x: from.x + from.w, y: from.y + L.EDGE_DY };
}

export function edgePath(from: Rect, fromKind: "story" | "event", to: Rect): string {
  const s = edgeStart(from, fromKind);
  const e = { x: to.x, y: to.y + to.h / 2 };
  const cx = L.CORRIDOR_X;
  const span = Math.max(0, e.x - cx);
  const dx = Math.min(Math.max(Math.abs(e.y - s.y) / 3, 40), 160, span / 2);
  return `M ${s.x} ${s.y} H ${cx} C ${cx + dx} ${s.y}, ${e.x - dx} ${e.y}, ${e.x} ${e.y}`;
}

// 곡선 위 표본점(회귀 — 중심 노드를 지나지 않는지).
export function edgeSamples(from: Rect, fromKind: "story" | "event", to: Rect, n = 20): { x: number; y: number }[] {
  const s = edgeStart(from, fromKind);
  const e = { x: to.x, y: to.y + to.h / 2 };
  const cx = L.CORRIDOR_X;
  const span = Math.max(0, e.x - cx);
  const dx = Math.min(Math.max(Math.abs(e.y - s.y) / 3, 40), 160, span / 2);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: s.x + ((cx - s.x) * i) / n, y: s.y }); // 수평 구간
  const p = [
    [cx, s.y],
    [cx + dx, s.y],
    [e.x - dx, e.y],
    [e.x, e.y],
  ];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push({ x: w.reduce((a, k, j) => a + k * p[j][0], 0), y: w.reduce((a, k, j) => a + k * p[j][1], 0) });
  }
  return out;
}

// 선택한 노드의 간선과 그 반대쪽 노드(연결된 노드 — 윤곽 강조). 접힌 띠의 이야기처럼 지도에 없는 노드는 빠진다.
export function selectionEdges(
  data: MyLifeData,
  layout: Pick<MyLifeLayout, "nodes">,
  selected: string | null,
  show: EdgeToggles,
): { edges: MapEdge[]; related: Set<string> } {
  const edges: MapEdge[] = [];
  const related = new Set<string>();
  if (!selected) return { edges, related };
  const node = new Map<string, LayoutNode>(layout.nodes.map((n) => [n.key, n]));
  const sel = node.get(selected);
  if (!sel) return { edges, related };

  const add = (fromKey: string, fromKind: "story" | "event", toKey: string, kind: EdgeKind) => {
    const a = node.get(fromKey);
    const b = node.get(toKey);
    if (!a || !b || !show[kind]) return;
    edges.push({ from: fromKey, to: toKey, kind, d: edgePath(a, fromKind, b) });
    related.add(fromKey === selected ? toKey : fromKey);
  };
  const storyNodes = layout.nodes.filter((n): n is Extract<LayoutNode, { kind: "story" }> => n.kind === "story");
  const storyOf = (n: Extract<LayoutNode, { kind: "story" }>) =>
    data.events.find((e) => e.id === n.eventId)?.stories.find((s) => s.id === n.storyId);

  if (sel.kind === "story") {
    for (const c of storyOf(sel)?.chips ?? []) {
      if (c.id && c.kind === "person") add(sel.key, "story", `pe:${c.id}`, "person");
      if (c.id && c.kind === "place") add(sel.key, "story", `pl:${c.id}`, "place");
      if (c.id && c.kind === "group" && node.has(`gl:${c.id}`)) related.add(`gl:${c.id}`);
    }
  } else if (sel.kind === "event") {
    const ev = data.events.find((e) => e.id === sel.eventId);
    for (const id of ev?.personIds ?? []) add(sel.key, "event", `pe:${id}`, "person");
    for (const id of ev?.placeIds ?? []) add(sel.key, "event", `pl:${id}`, "place");
    for (const id of ev?.groupIds ?? []) if (node.has(`gl:${id}`)) related.add(`gl:${id}`);
  } else if (sel.kind === "person" || sel.kind === "place") {
    const kind: EdgeKind = sel.kind;
    const id = sel.kind === "person" ? sel.personId : sel.placeId;
    for (const n of storyNodes) {
      if (storyOf(n)?.chips.some((c) => c.kind === kind && c.id === id)) add(n.key, "story", sel.key, kind);
    }
    for (const ev of data.events) {
      if ((kind === "person" ? ev.personIds : ev.placeIds).includes(id)) add(`ev:${ev.id}`, "event", sel.key, kind);
    }
  } else if (sel.kind === "groupLabel") {
    const g = data.groups.find((x) => x.id === sel.groupId);
    for (const id of g?.memberIds ?? []) if (node.has(`pe:${id}`)) related.add(`pe:${id}`);
  }
  return { edges, related };
}
