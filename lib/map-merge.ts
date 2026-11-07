// AI 지도 편집 3c 합치기(custom-graph §4.2·§6.10·Q88). 원본의 연결을 대상으로 옮기고 원본을 지운다. 되돌리기 없음(§6.10 ④).
//
// 범위: 사람+사람 · 장소+장소 · 항목+항목 · 항목→사람·장소. 내 노드만(기본 카테고리 행·초안 인물 제외).
// 연결·시기↔사람·구성원·이야기↔장소 = saveNodeLink 입구(같은 트랜잭션). 입구가 없는 칸(대상 인물·옛 기록 연결·이야기 장소 행·대화 구간 주제·글)만 여기서 옮긴다.
// 카드에 보인 수(mergeCheck)와 실행 때 다시 센 수가 다르면 실행하지 않는다(§6.10 ②).

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import type { MergeImpact } from "./map-edit-plan";
import { MY_LIFE_COPY } from "./my-life-copy";
import { keepRevision, type BodyDoc } from "./node-body";
import { CREATED_VIA_NODE_BODY, type BodyNodeType } from "./node-body-doc";
import { ALLOWED_PAIRS, normalizeNodePair, ROUTED_PAIRS, saveNodeLink, type NodeRef, type PeriodPersonOrigin } from "./node-graph";

const P = MY_LIFE_COPY.ask.plan;
const E = MY_LIFE_COPY.edit;
// 연결마다 왕복이 여럿이라 기본 5초로는 연결 많은 노드에서 모자랄 수 있다(합치기는 한 번에 한 건).
const MERGE_TX_MS = 20_000;

type Db = Prisma.TransactionClient;
type Side = { ref: NodeRef; kind: "person" | "place" | "item"; parentId: string | null };
type Move = { other: NodeRef; source: string; role: string; origin?: PeriodPersonOrigin };

const sameNode = (a: NodeRef, b: NodeRef) => a.type === b.type && a.id === b.id;

async function sideOf(userId: string, ref: NodeRef): Promise<Side | null> {
  if (ref.type === "PERSON") {
    const n = await prisma.person.count({ where: { id: ref.id, userId, subjectType: "person", isDraft: false } });
    return n > 0 ? { ref, kind: "person", parentId: null } : null;
  }
  if (ref.type === "PLACE") {
    const n = await prisma.place.count({ where: { id: ref.id, userId } });
    return n > 0 ? { ref, kind: "place", parentId: null } : null;
  }
  if (ref.type === "CUSTOM") {
    const n = await prisma.customNode.findFirst({ where: { id: ref.id, userId, kind: "ITEM", builtin: null }, select: { parentId: true } });
    return n ? { ref, kind: "item", parentId: n.parentId } : null;
  }
  return null;
}

// 대상으로 옮길 연결. 자기 자신이 되는 것·그 종류 쌍이 안 되는 것·이미 대상의 자리·대상 인물인 것은 뺀다.
async function movesOf(db: Db, userId: string, from: Side, to: Side): Promise<Move[]> {
  const rows = await db.nodeLink.findMany({
    where: { userId, status: "CONFIRMED", OR: [{ fromType: from.ref.type, fromId: from.ref.id }, { toType: from.ref.type, toId: from.ref.id }] },
    select: { fromType: true, fromId: true, toType: true, toId: true, role: true, source: true },
  });
  const moves: Move[] = rows.map((r) => ({
    other: r.fromType === from.ref.type && r.fromId === from.ref.id ? { type: r.toType, id: r.toId } : { type: r.fromType, id: r.fromId },
    source: r.source,
    role: r.role,
  }));
  if (from.kind === "person") {
    const [periods, groups] = await Promise.all([
      db.personLifeEvent.findMany({ where: { personId: from.ref.id, userId }, select: { lifeEventId: true, origin: true } }),
      db.personGroupMember.findMany({ where: { personId: from.ref.id, group: { userId } }, select: { groupId: true } }),
    ]);
    for (const p of periods) moves.push({ other: { type: "LIFE_EVENT", id: p.lifeEventId }, source: "USER", role: "", origin: p.origin as PeriodPersonOrigin });
    for (const g of groups) moves.push({ other: { type: "PERSON_GROUP", id: g.groupId }, source: "USER", role: "" });
  }
  if (from.kind === "place") {
    const groups = await db.placeGroupMember.findMany({ where: { placeId: from.ref.id, group: { userId } }, select: { groupId: true } });
    for (const g of groups) moves.push({ other: { type: "PLACE_GROUP", id: g.groupId }, source: "USER", role: "" });
  }
  // 항목의 자리 → 대상의 넣기 연결(대상이 같은 카테고리 항목이면 아래에서 빠짐)
  if (from.kind === "item" && from.parentId) moves.push({ other: { type: "CUSTOM", id: from.parentId }, source: "USER", role: "MEMBER" });

  const subjects =
    to.kind === "person"
      ? new Set((await db.episode.findMany({ where: { personId: to.ref.id, lifeEvent: { userId } }, select: { id: true } })).map((e) => e.id))
      : new Set<string>();
  return moves.filter((m) => {
    if (sameNode(m.other, to.ref)) return false;
    if (m.other.type === "EPISODE" && subjects.has(m.other.id)) return false; // 한 쌍 = 한 곳
    if (to.kind === "item" && m.other.type === "CUSTOM" && m.other.id === to.parentId) return false;
    const pair = normalizeNodePair(m.other, to.ref);
    if (!pair) return false;
    const key = `${pair.from.type}>${pair.to.type}`;
    return ROUTED_PAIRS.has(key) || ALLOWED_PAIRS.has(key);
  });
}

const BODY_TYPE: Partial<Record<Side["kind"], BodyNodeType>> = { person: "PERSON", item: "CUSTOM" };
// 빈 글 행(사진 올리기 전에 만들어진 것 등)은 글로 안 친다.
const hasBody = (b: { plainText: string; memoryId: string | null } | null) => !!b && (b.plainText.trim() !== "" || b.memoryId !== null);

export type MergeCheck = { ok: true; impact: MergeImpact; from: Side; to: Side } | { ok: false; error: string };

// 합칠 수 있는지 + 카드에 보일 수. DB 쓰기 0.
export async function mergeCheck(userId: string, fromRef: NodeRef, toRef: NodeRef): Promise<MergeCheck> {
  if (sameNode(fromRef, toRef)) return { ok: false, error: P.mergeSelf };
  const [from, to] = await Promise.all([sideOf(userId, fromRef), sideOf(userId, toRef)]);
  if (!from || !to) return { ok: false, error: P.mergeKinds };
  if (from.kind !== to.kind && from.kind !== "item") return { ok: false, error: P.mergeKinds };

  const bodyRow = (side: Side) => {
    const nodeType = BODY_TYPE[side.kind];
    return nodeType ? prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType, nodeId: side.ref.id } }, select: { plainText: true, memoryId: true } }) : null;
  };
  const [src, dst] = await Promise.all([bodyRow(from), bodyRow(to)]);
  if (hasBody(src) && !BODY_TYPE[to.kind]) return { ok: false, error: P.mergeBodyPlace };

  const moves = await movesOf(prisma, userId, from, to);
  let extra = 0;
  if (from.kind === "person") {
    const [subject, legacy] = await Promise.all([
      prisma.episode.count({ where: { personId: from.ref.id, lifeEvent: { userId } } }),
      prisma.personEvent.count({ where: { personId: from.ref.id, userId } }),
    ]);
    extra = subject + legacy;
  }
  if (from.kind === "place") extra = await prisma.memoryPlace.count({ where: { placeId: from.ref.id, memory: { userId } } });
  return { ok: true, from, to, impact: { links: moves.length + extra, body: !hasBody(src) ? "none" : hasBody(dst) ? "kept" : "moved" } };
}

// 글(Q88): 대상에 글이 없으면 통째로 옮김 · 둘 다 있으면 대상 글 그대로 + 원본 글 = 대상의 이전 판(20판 규칙 안). 사진은 대상 글 쪽으로(파일 안 지움).
async function moveBody(tx: Db, userId: string, from: Side, to: Side): Promise<void> {
  const fromType = BODY_TYPE[from.kind];
  const toType = BODY_TYPE[to.kind];
  if (!fromType || !toType) return;
  const src = await tx.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: fromType, nodeId: from.ref.id } }, select: { id: true, doc: true, plainText: true, memoryId: true } });
  if (!hasBody(src) || !src) return;
  const dst = await tx.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: toType, nodeId: to.ref.id } }, select: { id: true, memoryId: true, plainText: true } });
  if (!hasBody(dst) || !dst) {
    if (dst) await tx.nodeBody.delete({ where: { id: dst.id } });
    await tx.nodeBody.update({ where: { id: src.id }, data: { nodeType: toType, nodeId: to.ref.id } });
    await tx.nodeBodyRevision.updateMany({ where: { nodeType: fromType, nodeId: from.ref.id }, data: { nodeType: toType, nodeId: to.ref.id } });
    return;
  }
  await keepRevision(tx, userId, toType, to.ref.id, src.plainText, src.doc as unknown as BodyDoc);
  if (src.memoryId) {
    // 글 행을 지우면 트리거가 그 메모리와 사진을 같이 지운다(NodeBody_cleanup_memory) — 먼저 떼어 놓는다.
    await tx.nodeBody.update({ where: { id: src.id }, data: { memoryId: null } });
    if (dst.memoryId) {
      await tx.photo.updateMany({ where: { memoryId: src.memoryId, userId }, data: { memoryId: dst.memoryId } });
      await tx.userMemory.deleteMany({ where: { id: src.memoryId, userId, createdVia: CREATED_VIA_NODE_BODY } });
    } else {
      await tx.nodeBody.update({ where: { id: dst.id }, data: { memoryId: src.memoryId } });
    }
  }
  await tx.nodeBody.delete({ where: { id: src.id } });
}

// 대상의 빈 칸만 원본 값으로.
function emptyFill<T extends Record<string, unknown>>(from: T, to: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(to) as (keyof T)[]) if (to[k] === null && from[k] !== null) out[k] = from[k];
  return out;
}

const PERSON_FILL = { relation: true, birthYear: true, metYear: true, memo: true } as const;
const PLACE_FILL = { address: true, lat: true, lng: true, source: true, memo: true } as const;

async function moveLinks(tx: Db, userId: string, from: Side, to: Side): Promise<void> {
  for (const m of await movesOf(tx, userId, from, to)) {
    const pair = normalizeNodePair(m.other, to.ref);
    const routed = !!pair && ROUTED_PAIRS.has(`${pair.from.type}>${pair.to.type}`);
    const custom = m.other.type === "CUSTOM" || to.ref.type === "CUSTOM";
    await saveNodeLink(userId, m.other, to.ref, {
      db: tx,
      source: m.source === "AI" || m.source === "MIGRATION" ? m.source : "USER",
      ...(m.origin ? { origin: m.origin } : {}),
      ...(!routed && !custom && m.role ? { role: m.role } : {}),
    });
    // 항목 → 사람: 이야기와 잇는 것과 같이 그 이야기 시기↔사람도(지도 넣기 addLink 와 같은 뜻 — 출처 STORY)
    if (from.kind === "item" && to.kind === "person" && m.other.type === "EPISODE") {
      const ep = await tx.episode.findUnique({ where: { id: m.other.id }, select: { lifeEventId: true } });
      if (ep) await saveNodeLink(userId, { type: "LIFE_EVENT", id: ep.lifeEventId }, to.ref, { db: tx, origin: "STORY" });
    }
  }
}

async function movePersonRows(tx: Db, userId: string, fromId: string, toId: string): Promise<void> {
  const subject = await tx.episode.findMany({ where: { personId: fromId, lifeEvent: { userId } }, select: { id: true } });
  const ids = subject.map((e) => e.id);
  await tx.episode.updateMany({ where: { id: { in: ids } }, data: { personId: toId } });
  await tx.nodeLink.deleteMany({ where: { userId, fromType: "EPISODE", fromId: { in: ids }, toType: "PERSON", toId } }); // 이제 대상 인물 — 한 쌍 = 한 곳

  const legacy = await tx.personEvent.findMany({ where: { personId: fromId, userId }, select: { id: true, memoryId: true } });
  const have = new Set((await tx.personEvent.findMany({ where: { personId: toId, userId, memoryId: { in: legacy.map((l) => l.memoryId) } }, select: { memoryId: true } })).map((l) => l.memoryId));
  await tx.personEvent.updateMany({ where: { id: { in: legacy.filter((l) => !have.has(l.memoryId)).map((l) => l.id) } }, data: { personId: toId } });
  await tx.chatV3Segment.updateMany({ where: { userId, topicPersonId: fromId }, data: { topicPersonId: toId } });

  const [f, t] = await Promise.all([
    tx.person.findUniqueOrThrow({ where: { id: fromId }, select: PERSON_FILL }),
    tx.person.findUniqueOrThrow({ where: { id: toId }, select: PERSON_FILL }),
  ]);
  await tx.person.update({ where: { id: toId }, data: emptyFill(f, t) });
}

async function movePlaceRows(tx: Db, userId: string, fromId: string, toId: string): Promise<void> {
  const [f, t] = await Promise.all([
    tx.place.findUniqueOrThrow({ where: { id: fromId }, select: PLACE_FILL }),
    tx.place.findUniqueOrThrow({ where: { id: toId }, select: PLACE_FILL }),
  ]);
  const place = await tx.place.update({ where: { id: toId }, data: emptyFill(f, t), select: { name: true, address: true, lat: true, lng: true, source: true } });
  const rows = await tx.memoryPlace.findMany({ where: { placeId: fromId, memory: { userId } }, select: { id: true, memoryId: true } });
  const have = new Set((await tx.memoryPlace.findMany({ where: { placeId: toId, memoryId: { in: rows.map((r) => r.memoryId) } }, select: { memoryId: true } })).map((r) => r.memoryId));
  await tx.memoryPlace.deleteMany({ where: { id: { in: rows.filter((r) => have.has(r.memoryId)).map((r) => r.id) } } }); // 같은 이야기에 둘 다 있으면 한 행
  await tx.memoryPlace.updateMany({
    where: { id: { in: rows.filter((r) => !have.has(r.memoryId)).map((r) => r.id) } },
    data: { placeId: toId, placeName: place.name, placeAddress: place.address, lat: place.lat, lng: place.lng, placeSource: place.source },
  });
}

export async function mergeNodes(userId: string, fromRef: NodeRef, toRef: NodeRef, shown: MergeImpact): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await mergeCheck(userId, fromRef, toRef);
  if (!c.ok) return c;
  if (JSON.stringify(c.impact) !== JSON.stringify(shown)) return { ok: false, error: P.staleImpact };
  const { from, to } = c;
  await prisma.$transaction(
    async (tx) => {
      await moveLinks(tx, userId, from, to);
      if (from.kind === "person" && to.kind === "person") await movePersonRows(tx, userId, from.ref.id, to.ref.id);
      if (from.kind === "place" && to.kind === "place") await movePlaceRows(tx, userId, from.ref.id, to.ref.id);
      await moveBody(tx, userId, from, to);
      // 남은 연결·글은 노드 삭제 트리거가 정리한다. 사진은 위에서 옮겼으니 파일을 지울 것이 없다.
      const gone =
        from.kind === "person"
          ? await tx.person.deleteMany({ where: { id: from.ref.id, userId } })
          : from.kind === "place"
            ? await tx.place.deleteMany({ where: { id: from.ref.id, userId } })
            : await tx.customNode.deleteMany({ where: { id: from.ref.id, userId, kind: "ITEM", builtin: null } });
      if (gone.count === 0) throw new Error(E.notFound);
    },
    { timeout: MERGE_TX_MS },
  );
  return { ok: true };
}
