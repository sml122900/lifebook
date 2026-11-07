// AI 지도 편집(custom-graph 3b) — 계획의 모양과 카드 문장. 순수(클라이언트·서버 같이 씀 — DB·모델 0).
// 계획 = 모델이 낸 쓰기 도구를 서버가 확인해 실제 노드로 바꾼 것. 카드 문장은 코드가 조립한다(모델 말을 그대로 안 보여 줌 — §4.6).

import { MY_LIFE_COPY } from "./my-life-copy";
import type { DeleteImpact } from "./my-life-edit";
import type { NodeType } from "./generated/prisma/enums";
import { shortTitle } from "./story-title";

export const MAP_EDIT_PLAN_MAX = 10; // 한 번에 고칠 수 있는 수(§4.6 · undoLinks 상한과 같음)

export type CreateKind = "시기" | "이야기" | "사람" | "장소" | "모임" | "장소 묶음" | "카테고리" | "묶음" | "항목";
export const CREATE_KINDS: readonly CreateKind[] = ["시기", "이야기", "사람", "장소", "모임", "장소 묶음", "카테고리", "묶음", "항목"];

// 계획 안 노드 — 이미 있는 노드(ref) 또는 같은 계획에서 먼저 만드는 노드(newKey). key·eventId = 결과 카드 [지도에서 보기].
export type PlanNode =
  | { ref: { type: NodeType; id: string }; name: string; kind: string; key: string; eventId: string | null }
  | { newKey: string; name: string; kind: string };

export type ExistingNode = Extract<PlanNode, { ref: unknown }>;

export type BuiltinRegion = "PEOPLE" | "PLACES";

// 3c 합치기 — 카드에 보이는 수(§6.10 ①). 실행 때 다시 세어 다르면 안 한다. links = 옮겨지는 연결 수 · body = 원본 글이 어떻게 되는지.
export type MergeImpact = { links: number; body: "none" | "moved" | "kept" };

export type MapPlanItem =
  | { tool: "create_node"; newKey: string; kind: CreateKind; name: string; relation: string | null; year: number | null; endYear: number | null; parent: PlanNode | null; body: string | null; decision: "new" | null }
  | { tool: "rename_node"; node: PlanNode; newName: string }
  | { tool: "rename_region"; region: BuiltinRegion; prevLabel: string; newName: string }
  | { tool: "link"; a: PlanNode; b: PlanNode }
  | { tool: "unlink"; a: PlanNode; b: PlanNode }
  | { tool: "put_in"; container: PlanNode; member: PlanNode }
  | { tool: "take_out"; container: PlanNode; member: PlanNode }
  | { tool: "move"; node: PlanNode; to: PlanNode }
  | { tool: "delete_node"; node: ExistingNode; impact: DeleteImpact }
  | { tool: "merge_nodes"; from: ExistingNode; to: ExistingNode; fromLabel: string; toLabel: string; impact: MergeImpact };

const P = MY_LIFE_COPY.ask.plan;
const E = MY_LIFE_COPY.edit;
const X = MY_LIFE_COPY.custom;

// 지우기·합치기 — 되돌릴 수 없어서 계획에 혼자만 담는다(§6.10 ③).
export const isDestructive = (item: MapPlanItem) => item.tool === "delete_node" || item.tool === "merge_nodes";

export function deleteLinkedText(im: DeleteImpact): string {
  const parts = [
    ...(!im.storiesDeleted && im.stories > 0 ? [E.linkStories(im.stories)] : []),
    ...(im.people > 0 ? [E.linkPeople(im.people)] : []),
    ...(im.places > 0 ? [E.linkPlaces(im.places)] : []),
    ...(im.periods > 0 ? [E.linkPeriods(im.periods)] : []),
    ...(im.groups > 0 ? [E.linkGroups(im.groups)] : []),
  ];
  return parts.length > 0 ? E.deleteLinked(parts) : E.deleteNoLinks;
}

// 확인 카드의 영향 줄 — 지우기는 지도 패널과 같은 문장·같은 순서(§6.10 ①).
export function planNotes(item: MapPlanItem): string[] {
  if (item.tool === "delete_node") {
    const im = item.impact;
    return [
      ...(im.storiesDeleted && im.stories > 0 ? [E.deleteStoriesToo(im.stories)] : []),
      ...(im.customKind === "CATEGORY" ? [X.deleteCatNote(im.customDeleted, im.customOut)] : []),
      ...(im.customKind === "GROUP" ? [X.deleteGroupNote(im.customOut)] : []),
      ...(im.customKind === "ITEM" ? [X.deleteItemNote(im.customLinks)] : []),
      ...(im.customKind === "ITEM" && im.personBody ? [X.deleteItemBody] : []),
      ...(!im.customKind ? [deleteLinkedText(im)] : []),
      ...(im.placeGroups > 0 ? [E.deletePlaceGroups(im.placeGroups)] : []),
      ...(im.familyActivity > 0 ? [E.deleteFamily(im.familyActivity)] : []),
    ];
  }
  if (item.tool === "merge_nodes") {
    return [
      P.mergeMoved(item.fromLabel, item.toLabel, item.impact.links),
      ...(item.impact.body === "moved" ? [P.mergeBodyMoved(item.fromLabel, item.toLabel)] : []),
      ...(item.impact.body === "kept" ? [P.mergeBodyKept(item.fromLabel, item.toLabel)] : []),
    ];
  }
  return [];
}

// 할 일(확인 카드) / 한 일(결과 카드) — 같은 문장 틀, 끝말만 다르다.
export function planLine(item: MapPlanItem, tense: "will" | "did"): string {
  const t = tense;
  switch (item.tool) {
    case "create_node":
      if (item.parent && (item.kind === "항목" || item.kind === "묶음" || item.kind === "이야기")) return P.createIn(item.parent.name, item.kind, item.name || shortTitle(item.body ?? ""), t);
      return P.create(item.kind, item.name, item.relation, t);
    case "rename_node":
      return P.rename(item.node.name, item.newName, t);
    case "rename_region":
      return P.rename(item.prevLabel, item.newName, t);
    case "link":
      return P.link(item.a.name, item.b.name, t);
    case "unlink":
      return P.unlink(item.a.name, item.b.name, t);
    case "put_in":
      return P.putIn(item.member.name, item.container.name, t);
    case "take_out":
      return P.takeOut(item.member.name, item.container.name, t);
    case "move":
      return P.move(item.node.name, item.to.name, t);
    case "delete_node":
      return P.delete(item.node.name, t);
    case "merge_nodes":
      return P.merge(item.fromLabel, item.toLabel, t);
  }
}

// ── 화면에서 다시 오는 계획 확인(믿지 않음 — 도구·모양만 거른다. 소유·규칙은 실행 때 기존 입구가 다시 본다) ──────
const NODE_TYPES: readonly string[] = ["LIFE_EVENT", "EPISODE", "PERSON_GROUP", "PERSON", "PLACE_GROUP", "PLACE", "CUSTOM"];
const str = (v: unknown): v is string => typeof v === "string";

function planNode(v: unknown): PlanNode | null {
  const o = v as Record<string, unknown> | null;
  if (!o || !str(o.name) || !str(o.kind)) return null;
  if (str(o.newKey)) return { newKey: o.newKey, name: o.name, kind: o.kind };
  const r = o.ref as Record<string, unknown> | null;
  if (!r || !str(r.id) || !r.id || !str(r.type) || !NODE_TYPES.includes(r.type) || !str(o.key)) return null;
  return { ref: { type: r.type as NodeType, id: r.id }, name: o.name, kind: o.kind, key: o.key, eventId: str(o.eventId) ? o.eventId : null };
}

export function parsePlan(raw: unknown): MapPlanItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAP_EDIT_PLAN_MAX) return null;
  const out: MapPlanItem[] = [];
  for (const v of raw) {
    const o = v as Record<string, unknown> | null;
    if (!o) return null;
    if (o.tool === "create_node") {
      if (!str(o.newKey) || !CREATE_KINDS.includes(o.kind as CreateKind) || !str(o.name)) return null;
      const parent = o.parent == null ? null : planNode(o.parent);
      if (o.parent != null && !parent) return null;
      const num = (x: unknown) => (typeof x === "number" ? x : null);
      out.push({ tool: "create_node", newKey: o.newKey, kind: o.kind as CreateKind, name: o.name, relation: str(o.relation) ? o.relation : null, year: num(o.year), endYear: num(o.endYear), parent, body: str(o.body) ? o.body : null, decision: o.decision === "new" ? "new" : null });
    } else if (o.tool === "rename_node") {
      const node = planNode(o.node);
      if (!node || !str(o.newName)) return null;
      out.push({ tool: "rename_node", node, newName: o.newName });
    } else if (o.tool === "rename_region") {
      if ((o.region !== "PEOPLE" && o.region !== "PLACES") || !str(o.prevLabel) || !str(o.newName)) return null;
      out.push({ tool: "rename_region", region: o.region, prevLabel: o.prevLabel, newName: o.newName });
    } else if (o.tool === "link" || o.tool === "unlink") {
      const a = planNode(o.a);
      const b = planNode(o.b);
      if (!a || !b) return null;
      out.push(o.tool === "link" ? { tool: "link", a, b } : { tool: "unlink", a, b });
    } else if (o.tool === "put_in" || o.tool === "take_out") {
      const container = planNode(o.container);
      const member = planNode(o.member);
      if (!container || !member) return null;
      out.push(o.tool === "put_in" ? { tool: "put_in", container, member } : { tool: "take_out", container, member });
    } else if (o.tool === "move") {
      const node = planNode(o.node);
      const to = planNode(o.to);
      if (!node || !to) return null;
      out.push({ tool: "move", node, to });
    } else if (o.tool === "delete_node") {
      const node = planNode(o.node);
      // 수는 실행 때 다시 세어 비교하므로 고쳐 보내도 걸린다(§6.10 ②). 여기서는 모양만.
      if (!node || !("ref" in node) || !o.impact || typeof o.impact !== "object") return null;
      out.push({ tool: "delete_node", node, impact: o.impact as DeleteImpact });
    } else if (o.tool === "merge_nodes") {
      const from = planNode(o.from);
      const to = planNode(o.to);
      if (!from || !to || !("ref" in from) || !("ref" in to) || !str(o.fromLabel) || !str(o.toLabel) || !o.impact || typeof o.impact !== "object") return null;
      out.push({ tool: "merge_nodes", from, to, fromLabel: o.fromLabel, toLabel: o.toLabel, impact: o.impact as MergeImpact });
    } else {
      return null;
    }
  }
  if (out.some(isDestructive) && out.length !== 1) return null; // 혼자만(§6.10 ③)
  return out;
}
