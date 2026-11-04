// 사용자 카테고리 노드(CustomNode) — 만들기·이름·기본 카테고리 표시 이름·옮기기·지우기·같은 이름 판정.
// docs/phase/custom-graph.md §2.3·§6.4. 순수 lib(auth 없음 — 부르는 쪽이 userId 를 확인한다). 1단계는 화면·AI 가 부르지 않는다(회귀만).
//
// 규칙 — 코드만(DB 제약은 자기 자신 부모 CHECK 하나 — Q75: 깊이는 나중에 늘릴 수 있게 DB 에 두지 않음):
//   - 종류 CATEGORY·GROUP·ITEM. 자리(parentId): CATEGORY = 없음, GROUP·ITEM = 자기 카테고리(사용자 카테고리 — 기본 카테고리 행 아님).
//   - 깊이 2(카테고리 → 묶음 → 칸): 자리는 카테고리만 가리키고, 묶음 소속은 넣기 연결(lib/node-graph saveNodeLink — role
//     MEMBER, 같은 종류끼리 넣기 금지라 묶음 안 묶음 없음).
//   - 자리는 같은 사용자 노드만(남의 노드·없는 노드 = not_found — 있는지도 알리지 않음), 고리 거부(옮기기 포함 — 새 자리에서
//     자리를 따라 올라가 자기에게 돌아오면 거부).
//   - 기본 카테고리 행(builtin "PEOPLE"·"PLACES")은 표시 이름을 바꿀 때만 생긴다(setBuiltinName) — 없으면 화면이 기본 이름
//     (인물록·장소록, lib/my-life-copy). 자식·넣기 없음, 이름 말고는 못 바꿈, 지울 수 없음, 옮길 수 없음.
// 연결(넣기·관련)은 여기서 만들지 않는다 — 입구는 saveNodeLink·removeNodeLink 하나(옮기기의 겹치는 넣기 정리도 removeNodeLink).
// 지우기의 연결·본문 정리는 DB 트리거 CustomNode_node_graph_cleanup(카테고리 → 자기 묶음·항목은 parentId FK Cascade).

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import type { NodeType } from "./generated/prisma/enums";
import { removeNodeLink } from "./node-graph";
import { findSameNamePeople } from "./person-chat";

export const CUSTOM_KINDS = ["CATEGORY", "GROUP", "ITEM"] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
export const BUILTIN_CATEGORIES = ["PEOPLE", "PLACES"] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

// Q81(추천안 — 1단계 시작 때 확정): 카테고리 20(기본 2 포함 → 사용자 카테고리 18) · 사용자 묶음·항목 합계 300.
export const CUSTOM_LIMITS = { name: 30, categories: 18, nodes: 300 } as const;

export type CustomNodeReject = "need_name" | "too_long" | "not_found" | "bad_kind" | "self_parent" | "cycle" | "depth" | "builtin" | "limit";
export type Fail = { ok: false; reason: CustomNodeReject };

type Db = Prisma.TransactionClient | typeof prisma;

function cleanName(v: unknown): { ok: true; name: string } | Fail {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, reason: "need_name" };
  if ([...name].length > CUSTOM_LIMITS.name) return { ok: false, reason: "too_long" };
  return { ok: true, name };
}

// 새 자리(parentId)에서 자리를 따라 올라가다 nodeId 를 만나면 고리. 끝(자리 없음)·이미 본 노드(기존 고리)에서 멈춘다.
async function wouldCycle(db: Db, nodeId: string, parentId: string): Promise<boolean> {
  const seen = new Set<string>();
  let cur: string | null = parentId;
  for (let i = 0; cur !== null && i < 50; i++) {
    if (cur === nodeId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    const row: { parentId: string | null } | null = await db.customNode.findUnique({ where: { id: cur }, select: { parentId: true } });
    cur = row?.parentId ?? null;
  }
  return false;
}

// 자리 확인 — 순서: 자기 자신 → 있음·같은 사용자 → 고리 → 깊이(자리는 사용자 카테고리만). nodeId = 옮길 노드(새로 만들 때 null).
async function homeReject(db: Db, userId: string, nodeId: string | null, parentId: unknown): Promise<CustomNodeReject | null> {
  if (typeof parentId !== "string" || !parentId) return "not_found";
  if (nodeId !== null && parentId === nodeId) return "self_parent";
  const parent = await db.customNode.findUnique({ where: { id: parentId }, select: { userId: true, kind: true, builtin: true } });
  if (!parent || parent.userId !== userId) return "not_found";
  if (nodeId !== null && (await wouldCycle(db, nodeId, parentId))) return "cycle";
  if (parent.kind !== "CATEGORY" || parent.builtin !== null) return "depth";
  return null;
}

// ── 만들기 ─────────────────────────────────────────────────────────

export async function createCategory(userId: string, input: { name: unknown }): Promise<{ ok: true; id: string } | Fail> {
  const n = cleanName(input.name);
  if (!n.ok) return n;
  const count = await prisma.customNode.count({ where: { userId, kind: "CATEGORY", builtin: null } });
  if (count >= CUSTOM_LIMITS.categories) return { ok: false, reason: "limit" };
  const row = await prisma.customNode.create({ data: { userId, kind: "CATEGORY", name: n.name, sortOrder: count }, select: { id: true } });
  return { ok: true, id: row.id };
}

// 묶음·항목 — 자리 = 사용자 카테고리. 6종(시기·이야기·사람·장소·모임·장소 묶음)과 같은 이름인지 묻는 것은 부르는 쪽(sameNameNodes — 화면 Q98·AI Q100).
export async function createCustomNode(
  userId: string,
  input: { kind: unknown; name: unknown; parentId: unknown },
): Promise<{ ok: true; id: string } | Fail> {
  if (input.kind !== "GROUP" && input.kind !== "ITEM") return { ok: false, reason: "bad_kind" };
  const n = cleanName(input.name);
  if (!n.ok) return n;
  const bad = await homeReject(prisma, userId, null, input.parentId);
  if (bad) return { ok: false, reason: bad };
  const count = await prisma.customNode.count({ where: { userId, kind: { in: ["GROUP", "ITEM"] } } });
  if (count >= CUSTOM_LIMITS.nodes) return { ok: false, reason: "limit" };
  const row = await prisma.customNode.create({ data: { userId, kind: input.kind, parentId: input.parentId as string, name: n.name }, select: { id: true } });
  return { ok: true, id: row.id };
}

// ── 이름 ───────────────────────────────────────────────────────────

export async function renameCustomNode(userId: string, nodeId: string, nameInput: unknown): Promise<{ ok: true; prevName: string } | Fail> {
  const n = cleanName(nameInput);
  if (!n.ok) return n;
  const node = await prisma.customNode.findFirst({ where: { id: nodeId, userId }, select: { name: true, builtin: true } });
  if (!node) return { ok: false, reason: "not_found" };
  if (node.builtin !== null) return { ok: false, reason: "builtin" }; // 기본 카테고리 표시 이름은 setBuiltinName
  await prisma.customNode.update({ where: { id: nodeId }, data: { name: n.name } });
  return { ok: true, prevName: node.name };
}

// 기본 카테고리(인물록·장소록) 표시 이름 — 이 함수만 builtin 행을 만든다(처음 바꿀 때 생성, 다음부터 이름만 갱신).
export async function setBuiltinName(userId: string, builtin: unknown, nameInput: unknown): Promise<{ ok: true; prevName: string | null } | Fail> {
  if (builtin !== "PEOPLE" && builtin !== "PLACES") return { ok: false, reason: "bad_kind" };
  const n = cleanName(nameInput);
  if (!n.ok) return n;
  const where = { userId_builtin: { userId, builtin } };
  const prev = await prisma.customNode.findUnique({ where, select: { name: true } });
  await prisma.customNode.upsert({ where, create: { userId, kind: "CATEGORY", builtin, name: n.name }, update: { name: n.name } });
  return { ok: true, prevName: prev?.name ?? null };
}

// 기본 카테고리 표시 이름 — 행이 없으면 null(화면이 기본 이름을 쓴다).
export async function builtinNames(userId: string): Promise<Record<BuiltinCategory, string | null>> {
  const rows = await prisma.customNode.findMany({ where: { userId, builtin: { in: [...BUILTIN_CATEGORIES] } }, select: { builtin: true, name: true } });
  const of = (b: BuiltinCategory) => rows.find((r) => r.builtin === b)?.name ?? null;
  return { PEOPLE: of("PEOPLE"), PLACES: of("PLACES") };
}

// ── 옮기기 — 묶음·항목의 자리를 다른 사용자 카테고리로 ─────────────────────
// 새 자리로의 넣기 연결이 있었으면 자리와 겹치므로 removeNodeLink 로 먼저 지운다(한 쌍 = 한 곳). 그 밖의 넣기 연결은 그대로.

export async function moveCustomNode(
  userId: string,
  nodeId: string,
  parentId: unknown,
): Promise<{ ok: true; prevParentId: string | null; removedLinks: number } | Fail> {
  const node = await prisma.customNode.findFirst({ where: { id: nodeId, userId }, select: { kind: true, builtin: true, parentId: true } });
  if (!node) return { ok: false, reason: "not_found" };
  if (node.builtin !== null) return { ok: false, reason: "builtin" };
  const bad = await homeReject(prisma, userId, nodeId, parentId);
  if (bad) return { ok: false, reason: bad };
  if (node.kind !== "GROUP" && node.kind !== "ITEM") return { ok: false, reason: "depth" }; // 카테고리는 자리가 없다
  const target = parentId as string;
  if (node.parentId === target) return { ok: true, prevParentId: node.parentId, removedLinks: 0 };
  return prisma.$transaction(async (tx) => {
    const r = await removeNodeLink(userId, { type: "CUSTOM", id: nodeId }, { type: "CUSTOM", id: target }, { db: tx });
    await tx.customNode.update({ where: { id: nodeId }, data: { parentId: target } });
    return { ok: true as const, prevParentId: node.parentId, removedLinks: r.ok ? r.removed : 0 };
  });
}

// ── 지우기 — 묶음·항목은 그 행만(넣기 연결·본문은 트리거), 카테고리는 자기 묶음·항목까지(FK Cascade). 넣어 둔 6종 노드는 연결만 사라진다.

export async function deleteCustomNode(userId: string, nodeId: string): Promise<{ ok: true } | Fail> {
  const node = await prisma.customNode.findFirst({ where: { id: nodeId, userId }, select: { builtin: true } });
  if (!node) return { ok: false, reason: "not_found" };
  if (node.builtin !== null) return { ok: false, reason: "builtin" };
  await prisma.customNode.delete({ where: { id: nodeId } });
  return { ok: true };
}

// ── 같은 이름 판정(Q98 직접 만들기 안내 · Q100 AI 이름 대조 — 같은 함수) ─────────────────
// 6종 이름과 공백을 무시하고 같은 것: 확정 사람·장소·모임·장소 묶음 이름, 확정 시기 이름(고친 이름 우선), 이야기 제목. 사람 이름처럼
// 보이는지 추측하지 않는다(같은 이름만).
export type SameNameNode = { type: Exclude<NodeType, "CUSTOM">; id: string; name: string };

export async function sameNameNodes(userId: string, nameInput: string): Promise<SameNameNode[]> {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const key = norm(nameInput);
  if (!key) return [];
  const [people, places, groups, placeGroups, events, stories] = await Promise.all([
    findSameNamePeople(prisma, userId, nameInput),
    prisma.place.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.personGroup.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.placeGroup.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.lifeEvent.findMany({ where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } }, select: { id: true, label: true, correctedLabel: true } }),
    prisma.episode.findMany({ where: { lifeEvent: { userId } }, select: { id: true, memory: { select: { title: true } } } }),
  ]);
  const same = (s: string | null | undefined) => !!s && norm(s) === key;
  return [
    ...people.map((p) => ({ type: "PERSON" as const, id: p.id, name: p.name })),
    ...places.filter((p) => same(p.name)).map((p) => ({ type: "PLACE" as const, id: p.id, name: p.name })),
    ...groups.filter((g) => same(g.name)).map((g) => ({ type: "PERSON_GROUP" as const, id: g.id, name: g.name })),
    ...placeGroups.filter((g) => same(g.name)).map((g) => ({ type: "PLACE_GROUP" as const, id: g.id, name: g.name })),
    ...events.filter((e) => same(e.correctedLabel ?? e.label)).map((e) => ({ type: "LIFE_EVENT" as const, id: e.id, name: e.correctedLabel ?? e.label })),
    ...stories.filter((s) => same(s.memory.title)).map((s) => ({ type: "EPISODE" as const, id: s.id, name: s.memory.title as string })),
  ];
}
