// 노드 그래프 — 범용 연결(NodeLink) 저장. docs/phase/node-graph-self.md §1.4~§1.6.
//
// NodeLink 행은 이 파일의 saveNodeLink 로만 만든다(다른 곳에서 nodeLink.create 금지).
// saveNodeLink 는 노드 연결의 유일한 입구다(My Life Q44, 2026-11-01) — 이미 다른 칸에 저장하는 쌍 중
// 중심↔인물은 PersonLifeEvent, 이야기↔장소는 MemoryPlace, 모임↔사람은 PersonGroupMember, 장소 묶음↔장소는
// PlaceGroupMember 로 넘겨 저장한다(NodeLink 에 같은 쌍을 또 두지 않음). 빼기는 removeNodeLink 하나(Q50 —
// 같은 정규화·소유 확인 뒤 쌍에 따라 그 칸의 행을 지움, 노드는 지우지 않음).
//   1) 방향 정규화 — 노드 종류 순위(NODE_RANK)에서 상위가 from, 같은 종류는 id 바이트 순으로
//      앞선 쪽이 from. A→B 와 B→A 요청이 같은 행이 된다. DB 의 NodeLink_direction_check 가
//      같은 규칙(enum 선언 순서 + COLLATE "C")으로 어긋난 행을 거부한다.
//   2) 허용 쌍 확인 — NodeLink 에 두는 쌍(ALLOWED_PAIRS)과 기존 칸으로 넘기는 쌍(ROUTED_PAIRS)만 받는다.
//      그룹↔인물(PersonGroupMember) 등 그 밖의 쌍은 거부(한 쌍 = 한 곳).
//   3) 양 끝 소유 확인 — 두 노드 모두 이 사용자 것이어야 한다.
//   4) upsert — 이미 있으면 같은 행. PROPOSED 행에 CONFIRMED 요청이 오면 확정만 올린다
//      (확정 → 제안으로 내리지 않는다).
// 노드 삭제 시 연결 정리는 DB 트리거(마이그 20261030000000_node_graph)가 한다.
// 사용자 노드(CUSTOM — CustomNode, docs/phase/custom-graph.md §2.3)가 낀 쌍은 역할(role)을 부르는 쪽이 아니라
// customPairRole 이 노드 종류로 정한다 — 넣기 "MEMBER" / 관련 "". 부르는 쪽이 다른 role 을 넘기면 unsupported_option.

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import type { LinkStatus, NodeType } from "./generated/prisma/enums";

// 순위 — prisma/schema.prisma 의 NodeType 선언 순서와 같아야 한다(DB CHECK 가 그 순서를 쓴다).
// PLACE_GROUP 은 마이그 20261102000000_place_group 에서 PLACE 바로 위에 넣었다. CUSTOM 은 마이그 20261104000000_custom_node 에서
// 맨 뒤(가장 낮은 순위) — 기본 종류 ↔ 사용자 노드는 늘 기본 종류가 from, 사용자 노드끼리는 id 바이트 순.
export const NODE_RANK: readonly NodeType[] = ["LIFE_EVENT", "EPISODE", "PERSON_GROUP", "PERSON", "PLACE_GROUP", "PLACE", "CUSTOM"];

export type NodeRef = { type: NodeType; id: string };

// 정규화된 (from, to) 순서로 쓴 허용 쌍. 문서 §1.5 표의 NodeLink 행만. 정합 점검(lib/node-graph-reconcile.ts)도 이 목록을 쓴다.
export const ALLOWED_PAIRS: ReadonlySet<string> = new Set<string>([
  "LIFE_EVENT>EPISODE", // 이야기의 추가 소속 시기(주 소속은 Episode.lifeEventId)
  "LIFE_EVENT>PERSON_GROUP",
  "LIFE_EVENT>PLACE",
  "EPISODE>PERSON_GROUP",
  "EPISODE>PERSON", // 함께 나온 인물(대상 인물 1명은 Episode.personId)
  "PERSON>PLACE",
  // 사용자 노드(CUSTOM) 쌍 — 쌍 키만. 실제 허용 여부와 역할(넣기 MEMBER / 관련 "")은 customPairRole 이 노드 종류로 정한다.
  "LIFE_EVENT>CUSTOM",
  "EPISODE>CUSTOM",
  "PERSON_GROUP>CUSTOM",
  "PERSON>CUSTOM",
  "PLACE_GROUP>CUSTOM",
  "PLACE>CUSTOM",
  "CUSTOM>CUSTOM",
]);

// 정규화된 쌍 중 NodeLink 가 아니라 기존 칸에 저장하는 것(§1.5). 정합 점검의 "허용 안 된 쌍"은
// ALLOWED_PAIRS 만 보므로, 이 쌍이 NodeLink 행으로 있으면 여전히 이상 행으로 잡힌다.
export const ROUTED_PAIRS: ReadonlySet<string> = new Set<string>([
  "LIFE_EVENT>PERSON", // → PersonLifeEvent
  "EPISODE>PLACE", // → 이야기 브릿지 메모리의 MemoryPlace(placeId + 이름·주소·좌표 복사)
  "PERSON_GROUP>PERSON", // → PersonGroupMember(My Life 개편 3단계)
  "PLACE_GROUP>PLACE", // → PlaceGroupMember(My Life 개편 3단계)
]);

// 순수 함수 — 방향 정규화. 같은 노드끼리면 null.
export function normalizeNodePair(a: NodeRef, b: NodeRef): { from: NodeRef; to: NodeRef } | null {
  const ra = NODE_RANK.indexOf(a.type);
  const rb = NODE_RANK.indexOf(b.type);
  if (ra < 0 || rb < 0) throw new Error(`알 수 없는 노드 종류: ${a.type}/${b.type}`);
  if (ra !== rb) return ra < rb ? { from: a, to: b } : { from: b, to: a };
  if (a.id === b.id) return null;
  return a.id < b.id ? { from: a, to: b } : { from: b, to: a };
}

async function ownsNode(db: Prisma.TransactionClient, userId: string, n: NodeRef): Promise<boolean> {
  const where = { id: n.id, userId };
  switch (n.type) {
    case "LIFE_EVENT":
      return (await db.lifeEvent.count({ where })) > 0;
    case "EPISODE":
      return (await db.episode.count({ where: { id: n.id, lifeEvent: { userId } } })) > 0;
    case "PERSON_GROUP":
      return (await db.personGroup.count({ where })) > 0;
    case "PERSON":
      return (await db.person.count({ where })) > 0;
    case "PLACE_GROUP":
      return (await db.placeGroup.count({ where })) > 0;
    case "PLACE":
      return (await db.place.count({ where })) > 0;
    case "CUSTOM":
      return (await db.customNode.count({ where })) > 0;
  }
}

// ── 사용자 노드 역할 규칙(docs/phase/custom-graph.md §2.3 — 2026-11-04 성민) ─────────────────────────
// 종류 순서 카테고리 > 묶음 > 항목. 다른 종류끼리 = 넣기(MEMBER), 담는 쪽 = 순서가 높은 쪽. 같은 종류끼리는 넣기 금지 —
// 항목끼리만 관련("")(Q79), 묶음·카테고리끼리는 거부. 기본 종류(6종) ↔ 사용자 노드: 카테고리·묶음이면 넣기, 항목이면 관련
// (시기·이야기·사람·장소만 — 모임·장소 묶음 ↔ 항목 관련은 Q79 밖). 기본 카테고리 행(builtin — 인물록·장소록 표시 이름)은
// 넣기·관련 모두 거부(그 영역은 기존 영역 그대로). 담기는 쪽의 자리(parentId)가 담는 쪽이면 거부(이미 그 자리 — 한 쌍 = 한 곳).
export type CustomEnd = { type: "CUSTOM"; id: string; kind: string; parentId: string | null; builtin: string | null };
export type PairEnd = CustomEnd | { type: Exclude<NodeType, "CUSTOM">; id: string };
export type CustomPairReject = "pair_not_allowed" | "builtin_category" | "home_category" | "same_kind";
export type CustomPairRole = { ok: true; role: "MEMBER" | "" } | { ok: false; reason: CustomPairReject };

const KIND_ORDER: Readonly<Record<string, number>> = { CATEGORY: 3, GROUP: 2, ITEM: 1 };
const ITEM_RELATED: ReadonlySet<NodeType> = new Set<NodeType>(["LIFE_EVENT", "EPISODE", "PERSON", "PLACE"]);

// 순수 함수 — 두 끝 중 적어도 하나가 CUSTOM 일 때만 부른다.
export function customPairRole(a: PairEnd, b: PairEnd): CustomPairRole {
  for (const e of [a, b]) {
    if (e.type !== "CUSTOM") continue;
    if (e.builtin !== null) return { ok: false, reason: "builtin_category" };
    if (!Object.hasOwn(KIND_ORDER, e.kind)) return { ok: false, reason: "pair_not_allowed" };
  }
  if (a.type !== "CUSTOM" || b.type !== "CUSTOM") {
    const c = (a.type === "CUSTOM" ? a : b) as CustomEnd;
    const x = a.type === "CUSTOM" ? b : a;
    if (c.kind === "ITEM") return ITEM_RELATED.has(x.type) ? { ok: true, role: "" } : { ok: false, reason: "pair_not_allowed" };
    return { ok: true, role: "MEMBER" };
  }
  const oa = KIND_ORDER[a.kind];
  const ob = KIND_ORDER[b.kind];
  if (oa === ob) return a.kind === "ITEM" ? { ok: true, role: "" } : { ok: false, reason: "same_kind" };
  const [container, member] = oa > ob ? [a, b] : [b, a];
  if (member.parentId === container.id) return { ok: false, reason: "home_category" };
  return { ok: true, role: "MEMBER" };
}

// 소유는 부르는 쪽이 먼저 확인한다(ownsNode). 사용자 노드 끝의 종류·자리·기본 카테고리 표시를 읽어 역할을 정한다.
async function customRoleOf(db: Prisma.TransactionClient, userId: string, a: NodeRef, b: NodeRef): Promise<CustomPairRole> {
  const ids = [a, b].filter((n) => n.type === "CUSTOM").map((n) => n.id);
  const rows = await db.customNode.findMany({ where: { id: { in: ids }, userId }, select: { id: true, kind: true, parentId: true, builtin: true } });
  const end = (n: NodeRef): PairEnd | null => {
    if (n.type !== "CUSTOM") return { type: n.type, id: n.id };
    const r = rows.find((x) => x.id === n.id);
    return r ? { type: "CUSTOM", ...r } : null;
  };
  const ea = end(a);
  const eb = end(b);
  if (!ea || !eb) return { ok: false, reason: "pair_not_allowed" };
  return customPairRole(ea, eb);
}

// store — 실제로 저장한 칸. linkId 는 그 칸의 행 id(NodeLink·PersonLifeEvent·MemoryPlace·구성원 행).
export type LinkStore = "NODE_LINK" | "PERSON_LIFE_EVENT" | "MEMORY_PLACE" | "PERSON_GROUP_MEMBER" | "PLACE_GROUP_MEMBER";

// created — 이번 요청으로 새 행이 생겼는지(이미 있던 연결이면 false — 되돌리기는 created 인 것만 지운다).
// upgraded — 시기↔사람이 이야기 따라(STORY) 있던 쌍을 직접(DIRECT) 넣어 DIRECT 로 올렸음(되돌리기는 다시 STORY 로).
export type SaveNodeLinkResult =
  | { ok: true; linkId: string; status: LinkStatus; store: LinkStore; created: boolean; upgraded?: true }
  | {
      ok: false;
      // unsupported_option — 기존 칸으로 넘기는 쌍에 PROPOSED·role 요청(그 칸들엔 상태·역할이 없다)
      reason: "self_link" | "pair_not_allowed" | "not_found" | "primary_membership" | "unsupported_option" | Exclude<CustomPairReject, "pair_not_allowed">;
    };

export async function saveNodeLink(
  userId: string,
  a: NodeRef,
  b: NodeRef,
  // db — 트랜잭션 안에서 부를 때 그 클라이언트(2b-2 확인 화면). 없으면 기본 클라이언트.
  // origin — 시기↔사람(PersonLifeEvent)의 출처. 기본 DIRECT(직접 — 시기 패널·인물 질문 답·/people·그 밖 경로), STORY = 이야기 따라
  // (이야기에 사람 넣기·제안 카드·인물 확인 [맞아요]·옮기기). 같은 쌍이 STORY 로 있으면 DIRECT 넣기가 DIRECT 로 올린다(내리지 않음).
  opts: { role?: string; status?: LinkStatus; source?: "USER" | "AI" | "MIGRATION"; origin?: PeriodPersonOrigin; db?: Prisma.TransactionClient } = {},
): Promise<SaveNodeLinkResult> {
  const db = opts.db ?? prisma;
  const pair = normalizeNodePair(a, b);
  if (!pair) return { ok: false, reason: "self_link" };
  const { from, to } = pair;
  const key = `${from.type}>${to.type}`;
  const routed = ROUTED_PAIRS.has(key);
  if (!routed && !ALLOWED_PAIRS.has(key)) return { ok: false, reason: "pair_not_allowed" };
  if (routed && ((opts.status ?? "CONFIRMED") !== "CONFIRMED" || (opts.role ?? "") !== "")) {
    return { ok: false, reason: "unsupported_option" };
  }
  if (opts.origin !== undefined && key !== "LIFE_EVENT>PERSON") return { ok: false, reason: "unsupported_option" };

  const [fromOwned, toOwned] = await Promise.all([ownsNode(db, userId, from), ownsNode(db, userId, to)]);
  if (!fromOwned || !toOwned) return { ok: false, reason: "not_found" };

  let role = opts.role ?? "";
  if (from.type === "CUSTOM" || to.type === "CUSTOM") {
    const r = await customRoleOf(db, userId, from, to);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (opts.role !== undefined && opts.role !== r.role) return { ok: false, reason: "unsupported_option" };
    role = r.role;
  }

  const made = (linkId: string, store: LinkStore, created: boolean): SaveNodeLinkResult => ({ ok: true, linkId, status: "CONFIRMED", store, created });

  if (key === "LIFE_EVENT>PERSON") {
    const origin = opts.origin ?? "DIRECT";
    const where = { personId_lifeEventId: { personId: to.id, lifeEventId: from.id } };
    const had = await db.personLifeEvent.findUnique({ where, select: { id: true, origin: true } });
    if (had) {
      if (origin === "DIRECT" && had.origin === "STORY") {
        await db.personLifeEvent.update({ where: { id: had.id }, data: { origin: "DIRECT" } });
        return { ...made(had.id, "PERSON_LIFE_EVENT", false), upgraded: true } as SaveNodeLinkResult;
      }
      return made(had.id, "PERSON_LIFE_EVENT", false);
    }
    const row = await db.personLifeEvent.upsert({ where, create: { personId: to.id, lifeEventId: from.id, userId, origin }, update: {}, select: { id: true } });
    return made(row.id, "PERSON_LIFE_EVENT", true);
  }
  if (key === "PERSON_GROUP>PERSON") {
    const where = { groupId_personId: { groupId: from.id, personId: to.id } };
    const had = await db.personGroupMember.findUnique({ where, select: { id: true } });
    if (had) return made(had.id, "PERSON_GROUP_MEMBER", false);
    const row = await db.personGroupMember.upsert({ where, create: { groupId: from.id, personId: to.id, userId }, update: {}, select: { id: true } });
    return made(row.id, "PERSON_GROUP_MEMBER", true);
  }
  if (key === "PLACE_GROUP>PLACE") {
    const where = { groupId_placeId: { groupId: from.id, placeId: to.id } };
    const had = await db.placeGroupMember.findUnique({ where, select: { id: true } });
    if (had) return made(had.id, "PLACE_GROUP_MEMBER", false);
    const row = await db.placeGroupMember.upsert({ where, create: { groupId: from.id, placeId: to.id, userId }, update: {}, select: { id: true } });
    return made(row.id, "PLACE_GROUP_MEMBER", true);
  }
  if (key === "EPISODE>PLACE") {
    // 소유는 위에서 확인 — 이야기의 브릿지 메모리에 같은 장소 행이 있으면 그 행(멱등).
    const [ep, place] = await Promise.all([
      db.episode.findUniqueOrThrow({ where: { id: from.id }, select: { memoryId: true } }),
      db.place.findUniqueOrThrow({ where: { id: to.id }, select: { name: true, address: true, lat: true, lng: true, source: true } }),
    ]);
    const existing = await db.memoryPlace.findFirst({ where: { memoryId: ep.memoryId, placeId: to.id }, select: { id: true } });
    if (existing) return made(existing.id, "MEMORY_PLACE", false);
    const last = await db.memoryPlace.aggregate({ where: { memoryId: ep.memoryId }, _max: { sortOrder: true } });
    const row = await db.memoryPlace.create({
      data: {
        memoryId: ep.memoryId,
        placeId: to.id,
        placeName: place.name,
        placeAddress: place.address,
        lat: place.lat,
        lng: place.lng,
        placeSource: place.source,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    return made(row.id, "MEMORY_PLACE", true);
  }

  // 이야기의 주 소속 시기를 추가 소속으로 또 적지 않는다(한 쌍 = 한 곳).
  if (from.type === "LIFE_EVENT" && to.type === "EPISODE") {
    const primary = await db.episode.count({ where: { id: to.id, lifeEventId: from.id } });
    if (primary > 0) return { ok: false, reason: "primary_membership" };
  }

  const status = opts.status ?? "CONFIRMED";
  const unique = { fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, role };
  const had = await db.nodeLink.findUnique({ where: { fromType_fromId_toType_toId_role: unique }, select: { id: true } });
  const link = await db.nodeLink.upsert({
    where: { fromType_fromId_toType_toId_role: unique },
    create: {
      userId,
      ...unique,
      status,
      source: opts.source ?? "USER",
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    },
    update: {},
    select: { id: true, status: true },
  });
  if (status === "CONFIRMED" && link.status === "PROPOSED") {
    await db.nodeLink.update({
      where: { id: link.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    return { ok: true, linkId: link.id, status: "CONFIRMED", store: "NODE_LINK", created: false };
  }
  return { ok: true, linkId: link.id, status: link.status, store: "NODE_LINK", created: !had };
}

// ── 빼기 — 연결만 끊는다(노드 삭제 아님). My Life Q50 · docs/phase/my-life-restructure.md §4.3 ──
//
// saveNodeLink 와 같은 입구 규칙: 방향 정규화 → 허용 쌍 → 양 끝 소유 확인 → 쌍에 따라 그 칸의 행을 지운다.
//   NodeLink 쌍 = 그 두 노드 사이 행(role 지정 시 그 role 만, 상태 무관) / 중심↔인물 = PersonLifeEvent /
//   이야기↔장소 = 그 이야기 브릿지 메모리의 그 placeId MemoryPlace 행 / 모임·묶음 ↔ 구성원 = 구성원 행.
// 빼기 대상이 아닌 것: 이야기의 주 소속 시기(Episode.lifeEventId — 옮기기로)·대상 인물(Episode.personId).
// 없는 연결을 빼면 removed 0 으로 통과(멱등 — 되돌리기를 두 번 눌러도 안전).
// rows = 지운 행의 되살림 값(빼기 되돌리기 — Q50 보완 2026-11-02, restoreNodeLink). 행 id 는 다시 쓰지 않는다(다른 곳이
//   이 행 id 를 참조하지 않음) — 화면 순서를 정하는 값(만든 때·정렬 순서)과 NodeLink 의 역할·상태·출처·확인 때만.
export type PeriodPersonOrigin = "DIRECT" | "STORY";
export type RemovedLinkRow = {
  createdAt: string;
  origin?: PeriodPersonOrigin; // 시기↔사람(PersonLifeEvent) 행만
  role?: string;
  status?: LinkStatus;
  source?: "USER" | "AI" | "MIGRATION";
  confirmedAt?: string | null;
  sortOrder?: number;
};
// 빼기 되돌리기 값 한 쌍 — removeNodeLink 를 부른 쪽이 (a, b, rows)로 묶어 화면에 넘기고 restoreNodeLink 로 되살린다.
export type RemovedLink = { a: NodeRef; b: NodeRef; rows: RemovedLinkRow[] };
export type RemoveNodeLinkResult =
  | { ok: true; removed: number; store: LinkStore; rows: RemovedLinkRow[] }
  | { ok: false; reason: "self_link" | "pair_not_allowed" | "not_found" | "primary_membership" | "subject_person" };

export async function removeNodeLink(
  userId: string,
  a: NodeRef,
  b: NodeRef,
  opts: { role?: string; db?: Prisma.TransactionClient } = {},
): Promise<RemoveNodeLinkResult> {
  const db = opts.db ?? prisma;
  const pair = normalizeNodePair(a, b);
  if (!pair) return { ok: false, reason: "self_link" };
  const { from, to } = pair;
  const key = `${from.type}>${to.type}`;
  if (!ROUTED_PAIRS.has(key) && !ALLOWED_PAIRS.has(key)) return { ok: false, reason: "pair_not_allowed" };

  const [fromOwned, toOwned] = await Promise.all([ownsNode(db, userId, from), ownsNode(db, userId, to)]);
  if (!fromOwned || !toOwned) return { ok: false, reason: "not_found" };

  // 사용자 노드 쌍 — 저장과 같은 계산으로 역할을 정해 그 행만 지운다(다른 role 을 넘기면 지울 행 없음).
  let roleFilter: string | undefined = opts.role;
  if (from.type === "CUSTOM" || to.type === "CUSTOM") {
    const r = await customRoleOf(db, userId, from, to);
    if (!r.ok) return { ok: false, reason: "pair_not_allowed" };
    if (opts.role !== undefined && opts.role !== r.role) return { ok: true, removed: 0, store: "NODE_LINK", rows: [] };
    roleFilter = r.role;
  }

  // 지울 행을 먼저 읽어 되살림 값을 남기고, 그 id 들만 지운다.
  const at = (d: Date) => d.toISOString();
  if (key === "LIFE_EVENT>PERSON") {
    const rows = await db.personLifeEvent.findMany({ where: { personId: to.id, lifeEventId: from.id, userId }, select: { id: true, createdAt: true, origin: true } });
    const r = await db.personLifeEvent.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
    return {
      ok: true,
      removed: r.count,
      store: "PERSON_LIFE_EVENT",
      rows: rows.map((x) => ({ createdAt: at(x.createdAt), origin: x.origin === "STORY" ? ("STORY" as const) : ("DIRECT" as const) })),
    };
  }
  if (key === "PERSON_GROUP>PERSON") {
    const rows = await db.personGroupMember.findMany({ where: { groupId: from.id, personId: to.id }, select: { id: true, createdAt: true } });
    const r = await db.personGroupMember.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
    return { ok: true, removed: r.count, store: "PERSON_GROUP_MEMBER", rows: rows.map((x) => ({ createdAt: at(x.createdAt) })) };
  }
  if (key === "PLACE_GROUP>PLACE") {
    const rows = await db.placeGroupMember.findMany({ where: { groupId: from.id, placeId: to.id }, select: { id: true, createdAt: true } });
    const r = await db.placeGroupMember.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
    return { ok: true, removed: r.count, store: "PLACE_GROUP_MEMBER", rows: rows.map((x) => ({ createdAt: at(x.createdAt) })) };
  }
  if (key === "EPISODE>PLACE") {
    const ep = await db.episode.findUniqueOrThrow({ where: { id: from.id }, select: { memoryId: true } });
    const rows = await db.memoryPlace.findMany({ where: { memoryId: ep.memoryId, placeId: to.id }, select: { id: true, createdAt: true, sortOrder: true } });
    const r = await db.memoryPlace.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
    return { ok: true, removed: r.count, store: "MEMORY_PLACE", rows: rows.map((x) => ({ createdAt: at(x.createdAt), sortOrder: x.sortOrder })) };
  }
  if (key === "LIFE_EVENT>EPISODE" && (await db.episode.count({ where: { id: to.id, lifeEventId: from.id } })) > 0) {
    return { ok: false, reason: "primary_membership" };
  }
  if (key === "EPISODE>PERSON" && (await db.episode.count({ where: { id: from.id, personId: to.id } })) > 0) {
    return { ok: false, reason: "subject_person" };
  }
  const rows = await db.nodeLink.findMany({
    where: { userId, fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, ...(roleFilter !== undefined ? { role: roleFilter } : {}) },
    select: { id: true, role: true, status: true, source: true, createdAt: true, confirmedAt: true },
  });
  const r = await db.nodeLink.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
  return {
    ok: true,
    removed: r.count,
    store: "NODE_LINK",
    rows: rows.map((x) => ({
      createdAt: at(x.createdAt),
      role: x.role,
      status: x.status,
      source: x.source === "AI" || x.source === "MIGRATION" ? x.source : "USER",
      confirmedAt: x.confirmedAt ? at(x.confirmedAt) : null,
    })),
  };
}

// ── 빼기 되돌리기(Q50 보완 2026-11-02) — removeNodeLink 가 돌려준 rows 를 같은 입구(saveNodeLink)로 다시 잇고,
// 화면 순서를 정하는 값(만든 때·정렬 순서·확인 때)만 되살린다. rows 는 화면을 거쳐 돌아오므로 다시 검사한다 —
// 쌍·양 끝 소유는 saveNodeLink 가, 값은 형식만(자기 기록의 순서 값이라 다른 사람 데이터에 닿지 않음).
// 그사이 같은 연결이 다시 생겼으면 그 행은 그대로 둔다(created false — 멱등).
export type RestoreNodeLinkResult =
  | { ok: true; restored: number }
  | { ok: false; reason: "bad_rows" | "self_link" | "pair_not_allowed" | "not_found" | "primary_membership" | "unsupported_option" | Exclude<CustomPairReject, "pair_not_allowed"> };

function parseRemovedRow(v: unknown): RemovedLinkRow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const date = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null);
  const createdAt = date(o.createdAt);
  if (!createdAt) return null;
  const row: RemovedLinkRow = { createdAt };
  if (o.role !== undefined) {
    if (typeof o.role !== "string" || o.role.length > 50) return null;
    if (o.status !== "CONFIRMED" && o.status !== "PROPOSED") return null;
    if (o.source !== "USER" && o.source !== "AI" && o.source !== "MIGRATION") return null;
    if (o.confirmedAt !== null && date(o.confirmedAt) === null) return null;
    Object.assign(row, { role: o.role, status: o.status, source: o.source, confirmedAt: o.confirmedAt });
  }
  if (o.sortOrder !== undefined) {
    if (!Number.isInteger(o.sortOrder) || (o.sortOrder as number) < 0 || (o.sortOrder as number) > 100_000) return null;
    row.sortOrder = o.sortOrder as number;
  }
  if (o.origin !== undefined) {
    if (o.origin !== "DIRECT" && o.origin !== "STORY") return null;
    row.origin = o.origin;
  }
  return row;
}

export async function restoreNodeLink(userId: string, a: NodeRef, b: NodeRef, rows: unknown): Promise<RestoreNodeLinkResult> {
  const list = (Array.isArray(rows) ? rows.slice(0, 10) : []).map(parseRemovedRow);
  if (list.length === 0 || list.some((r) => r === null)) return { ok: false, reason: "bad_rows" };
  let restored = 0;
  for (const row of list as RemovedLinkRow[]) {
    const r = await prisma.$transaction(async (tx) => {
      const s = await saveNodeLink(
        userId,
        a,
        b,
        row.role !== undefined ? { role: row.role, status: row.status, source: row.source, db: tx } : row.origin !== undefined ? { origin: row.origin, db: tx } : { db: tx },
      );
      if (!s.ok || !s.created) return s;
      const createdAt = new Date(row.createdAt);
      if (s.store === "PERSON_LIFE_EVENT") await tx.personLifeEvent.update({ where: { id: s.linkId }, data: { createdAt } });
      else if (s.store === "PERSON_GROUP_MEMBER") await tx.personGroupMember.update({ where: { id: s.linkId }, data: { createdAt } });
      else if (s.store === "PLACE_GROUP_MEMBER") await tx.placeGroupMember.update({ where: { id: s.linkId }, data: { createdAt } });
      else if (s.store === "MEMORY_PLACE") await tx.memoryPlace.update({ where: { id: s.linkId }, data: { createdAt, ...(row.sortOrder !== undefined ? { sortOrder: row.sortOrder } : {}) } });
      else await tx.nodeLink.update({ where: { id: s.linkId }, data: { createdAt, ...(row.role !== undefined ? { confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null } : {}) } });
      return s;
    });
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.created) restored++;
  }
  return { ok: true, restored };
}

// ── 시기↔사람 출처 — 이야기 따라 생긴 연결(STORY) 정리(2026-11-02 3단계 E2E, docs/phase/my-life-restructure.md §14.8) ──
//
// 그 시기 이야기 = 주 소속(Episode.lifeEventId) + 추가 소속(NodeLink LIFE_EVENT→EPISODE).
// 그 분이 나옴 = 대상 인물(Episode.personId) 또는 확정 연결(EPISODE→PERSON CONFIRMED). 확인 대기 연결만으로는 안 나옴.
export async function personAppearsInPeriod(db: Prisma.TransactionClient | typeof prisma, userId: string, lifeEventId: string, personId: string): Promise<boolean> {
  const extra = await db.nodeLink.findMany({ where: { userId, fromType: "LIFE_EVENT", fromId: lifeEventId, toType: "EPISODE" }, select: { toId: true } });
  const eps = await db.episode.findMany({
    where: { lifeEvent: { userId }, OR: [{ lifeEventId }, { id: { in: extra.map((x) => x.toId) } }] },
    select: { id: true, personId: true },
  });
  if (eps.some((e) => e.personId === personId)) return true;
  if (eps.length === 0) return false;
  return (
    (await db.nodeLink.count({
      where: { userId, fromType: "EPISODE", fromId: { in: eps.map((e) => e.id) }, toType: "PERSON", toId: personId, status: "CONFIRMED" },
    })) > 0
  );
}

// 이야기 하나가 걸친 (시기, 사람) 쌍 — 시기 = 주 소속 + 추가 소속, 사람 = 대상 인물 + 확정 연결. 정리 대상 고르기용.
export async function periodPeoplePairsOfEpisode(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  episodeId: string,
): Promise<{ lifeEventId: string; personId: string }[]> {
  const ep = await db.episode.findFirst({ where: { id: episodeId, lifeEvent: { userId } }, select: { lifeEventId: true, personId: true } });
  if (!ep) return [];
  const [extra, linked] = await Promise.all([
    db.nodeLink.findMany({ where: { userId, fromType: "LIFE_EVENT", toType: "EPISODE", toId: episodeId }, select: { fromId: true } }),
    db.nodeLink.findMany({ where: { userId, fromType: "EPISODE", fromId: episodeId, toType: "PERSON", status: "CONFIRMED" }, select: { toId: true } }),
  ]);
  const events = [ep.lifeEventId, ...extra.map((x) => x.fromId)];
  const people = [...new Set([...(ep.personId ? [ep.personId] : []), ...linked.map((l) => l.toId)])];
  return events.flatMap((lifeEventId) => people.map((personId) => ({ lifeEventId, personId })));
}

// 빼기·옮기기·이야기 지우기 뒤 — 그 쌍의 STORY 연결이 그 시기 이야기에 그 분이 하나도 안 나오면 지운다. DIRECT 는 그대로.
// 지운 행의 되살림 값을 돌려준다(되돌리기 — restoreNodeLink 로 출처까지 그대로).
export async function cleanupStoryPeriodPeople(
  userId: string,
  pairs: { lifeEventId: string; personId: string }[],
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<RemovedLink[]> {
  const out: RemovedLink[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    const k = `${p.lifeEventId}:${p.personId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const story = await db.personLifeEvent.count({ where: { lifeEventId: p.lifeEventId, personId: p.personId, userId, origin: "STORY" } });
    if (story === 0 || (await personAppearsInPeriod(db, userId, p.lifeEventId, p.personId))) continue;
    const a: NodeRef = { type: "LIFE_EVENT", id: p.lifeEventId };
    const b: NodeRef = { type: "PERSON", id: p.personId };
    const r = await removeNodeLink(userId, a, b, { db: db as Prisma.TransactionClient });
    if (r.ok && r.rows.length > 0) out.push({ a, b, rows: r.rows });
  }
  return out;
}

// 직접 넣기로 STORY → DIRECT 올린 것의 되돌리기 — 다시 STORY(그 쌍이 지금 DIRECT 일 때만).
export async function revertPeriodPersonUpgrade(userId: string, lifeEventId: string, personId: string): Promise<void> {
  await prisma.personLifeEvent.updateMany({ where: { userId, lifeEventId, personId, origin: "DIRECT" }, data: { origin: "STORY" } });
}
