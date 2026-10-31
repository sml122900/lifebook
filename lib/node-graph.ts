// 노드 그래프 — 범용 연결(NodeLink) 저장. docs/phase/node-graph-self.md §1.4~§1.6.
//
// NodeLink 행은 이 파일의 saveNodeLink 로만 만든다(다른 곳에서 nodeLink.create 금지).
//   1) 방향 정규화 — 노드 종류 순위(NODE_RANK)에서 상위가 from, 같은 종류는 id 바이트 순으로
//      앞선 쪽이 from. A→B 와 B→A 요청이 같은 행이 된다. DB 의 NodeLink_direction_check 가
//      같은 규칙(enum 선언 순서 + COLLATE "C")으로 어긋난 행을 거부한다.
//   2) 허용 쌍 확인 — 이미 다른 곳에 저장하는 쌍(인물↔중심 = PersonLifeEvent, 이야기↔장소 =
//      MemoryPlace, 그룹↔인물 = PersonGroupMember)은 여기서 받지 않는다(한 쌍 = 한 곳).
//   3) 양 끝 소유 확인 — 두 노드 모두 이 사용자 것이어야 한다.
//   4) upsert — 이미 있으면 같은 행. PROPOSED 행에 CONFIRMED 요청이 오면 확정만 올린다
//      (확정 → 제안으로 내리지 않는다).
// 노드 삭제 시 연결 정리는 DB 트리거(마이그 20261030000000_node_graph)가 한다.

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import type { LinkStatus, NodeType } from "./generated/prisma/enums";

// 순위 — prisma/schema.prisma 의 NodeType 선언 순서와 같아야 한다(DB CHECK 가 그 순서를 쓴다).
export const NODE_RANK: readonly NodeType[] = ["LIFE_EVENT", "EPISODE", "PERSON_GROUP", "PERSON", "PLACE"];

export type NodeRef = { type: NodeType; id: string };

// 정규화된 (from, to) 순서로 쓴 허용 쌍. 문서 §1.5 표의 NodeLink 행만. 정합 점검(lib/node-graph-reconcile.ts)도 이 목록을 쓴다.
export const ALLOWED_PAIRS: ReadonlySet<string> = new Set<string>([
  "LIFE_EVENT>EPISODE", // 이야기의 추가 소속 시기(주 소속은 Episode.lifeEventId)
  "LIFE_EVENT>PERSON_GROUP",
  "LIFE_EVENT>PLACE",
  "EPISODE>PERSON_GROUP",
  "EPISODE>PERSON", // 함께 나온 인물(대상 인물 1명은 Episode.personId)
  "PERSON>PLACE",
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
    case "PLACE":
      return (await db.place.count({ where })) > 0;
  }
}

export type SaveNodeLinkResult =
  | { ok: true; linkId: string; status: LinkStatus }
  | { ok: false; reason: "self_link" | "pair_not_allowed" | "not_found" | "primary_membership" };

export async function saveNodeLink(
  userId: string,
  a: NodeRef,
  b: NodeRef,
  // db — 트랜잭션 안에서 부를 때 그 클라이언트(2b-2 확인 화면). 없으면 기본 클라이언트.
  opts: { role?: string; status?: LinkStatus; source?: "USER" | "AI" | "MIGRATION"; db?: Prisma.TransactionClient } = {},
): Promise<SaveNodeLinkResult> {
  const db = opts.db ?? prisma;
  const pair = normalizeNodePair(a, b);
  if (!pair) return { ok: false, reason: "self_link" };
  const { from, to } = pair;
  if (!ALLOWED_PAIRS.has(`${from.type}>${to.type}`)) return { ok: false, reason: "pair_not_allowed" };

  const [fromOwned, toOwned] = await Promise.all([ownsNode(db, userId, from), ownsNode(db, userId, to)]);
  if (!fromOwned || !toOwned) return { ok: false, reason: "not_found" };

  // 이야기의 주 소속 시기를 추가 소속으로 또 적지 않는다(한 쌍 = 한 곳).
  if (from.type === "LIFE_EVENT" && to.type === "EPISODE") {
    const primary = await db.episode.count({ where: { id: to.id, lifeEventId: from.id } });
    if (primary > 0) return { ok: false, reason: "primary_membership" };
  }

  const role = opts.role ?? "";
  const status = opts.status ?? "CONFIRMED";
  const link = await db.nodeLink.upsert({
    where: {
      fromType_fromId_toType_toId_role: {
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
        role,
      },
    },
    create: {
      userId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      role,
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
    return { ok: true, linkId: link.id, status: "CONFIRMED" };
  }
  return { ok: true, linkId: link.id, status: link.status };
}
