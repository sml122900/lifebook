"use server";

// My Life 개편 3단계 — 지도에서 직접 만들기·넣기·빼기·되돌리기·옮기기·지우기. docs/phase/my-life-restructure.md §4.
// 첫 줄 auth 확인 + 본체는 순수 모듈(lib/my-life-edit·lib/episode-move·lib/episode·lib/life-event-delete).
// revalidatePath 없음 — /my-life 는 auth() 로 늘 동적 렌더, 화면이 router.refresh() 로 다시 그린다
// (/story-review 지우기와 같은 이유 — app/actions/episode.ts deleteEpisodeAction 주석).
// 지도 노드 키: 시기 ev:<id> · 이야기 st:<시기>:<이야기> · 사람 pe: · 장소 pl: · 모임 gl: · 장소 묶음 pgl:.

import { auth } from "@/auth";
import { deleteEpisode } from "@/lib/episode";
import { moveEpisodeToLifeEvent, undoMoveEpisode, type MoveUndo } from "@/lib/episode-move";
import type { NodeType } from "@/lib/generated/prisma/enums";
import { deleteCustomLifeEvent } from "@/lib/life-event-delete";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import {
  addLink,
  createGroupNode,
  createPeriodNode,
  createPersonNode,
  createPlaceGroupNode,
  createPlaceNode,
  createStoryNode,
  deleteGroupNode,
  deleteImpact,
  deletePlaceGroupNode,
  deletePlaceNode,
  removeLink,
  undoLinks,
  undoRemove,
  type CreatedLink,
  type DeleteImpact,
  type RemovedLink,
  type SameNamePerson,
} from "@/lib/my-life-edit";
import { NODE_RANK, type NodeRef } from "@/lib/node-graph";
import { deletePerson } from "@/lib/people";

const E = MY_LIFE_COPY.edit;

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function ref(v: unknown): NodeRef | null {
  const r = v as { type?: unknown; id?: unknown } | null;
  if (!r || typeof r.id !== "string" || !r.id || !NODE_RANK.includes(r.type as NodeType)) return null;
  return { type: r.type as NodeType, id: r.id };
}

// 만든 것을 되돌릴 때 지울 대상(이미 있던 것을 다시 쓴 경우 = null — 되돌릴 게 없음).
export type CreatedNode = { kind: "period" | "story" | "person" | "place" | "group" | "placeGroup"; id: string };

export type CreateInput =
  | { kind: "period"; label: string; year: number | null; endYear: number | null }
  | { kind: "story" | "self"; lifeEventId: string; title: string; content: string; personIds: string[]; groupIds: string[]; placeIds: string[] }
  | { kind: "person"; name: string; relation: string; groupIds: string[]; decision?: "same" | "different"; samePersonId?: string; contextEventId?: string | null }
  | { kind: "place"; name: string; address: string | null; lat: number | null; lng: number | null; source: string | null }
  | { kind: "group"; name: string; memberIds: string[] }
  | { kind: "placeGroup"; name: string; placeIds: string[] };

export type CreateResult =
  | { ok: true; key: string; eventId: string | null; undo: CreatedNode | null; reused: boolean }
  | { ok: false; error: string }
  | { ok: false; ask: SameNamePerson[] };

export async function createNodeAction(input: CreateInput): Promise<CreateResult> {
  const userId = await requireUserId();
  switch (input?.kind) {
    case "period": {
      const r = await createPeriodNode(userId, input);
      return r.ok ? { ok: true, key: `ev:${r.eventId}`, eventId: r.eventId, undo: { kind: "period", id: r.eventId }, reused: false } : r;
    }
    case "story":
    case "self": {
      const r = await createStoryNode(userId, { ...input, kind: input.kind === "self" ? "SELF" : "STORY" });
      return r.ok ? { ok: true, key: `st:${r.eventId}:${r.episodeId}`, eventId: r.eventId, undo: { kind: "story", id: r.episodeId }, reused: false } : r;
    }
    case "person": {
      const r = await createPersonNode(userId, input);
      if (!r.ok) return r;
      return { ok: true, key: `pe:${r.personId}`, eventId: null, undo: r.reused ? null : { kind: "person", id: r.personId }, reused: r.reused };
    }
    case "place": {
      const r = await createPlaceNode(userId, input);
      if (!r.ok) return r;
      return { ok: true, key: `pl:${r.placeId}`, eventId: null, undo: r.reused ? null : { kind: "place", id: r.placeId }, reused: r.reused };
    }
    case "group": {
      const r = await createGroupNode(userId, input);
      return r.ok ? { ok: true, key: `gl:${r.groupId}`, eventId: null, undo: { kind: "group", id: r.groupId }, reused: false } : r;
    }
    case "placeGroup": {
      const r = await createPlaceGroupNode(userId, input);
      return r.ok ? { ok: true, key: `pgl:${r.groupId}`, eventId: null, undo: { kind: "placeGroup", id: r.groupId }, reused: false } : r;
    }
    default:
      return { ok: false, error: E.failed };
  }
}

// 방금 만든 노드 되돌리기 — 만든 직후 패널의 [되돌리기]. 사람도 여기서는 지운다(방금 만든 분 — 본인 것만).
export async function undoCreateAction(node: CreatedNode): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (!node || typeof node.id !== "string") return { ok: false, error: E.notFound };
  switch (node.kind) {
    case "period": {
      const r = await deleteCustomLifeEvent(userId, node.id);
      return r.ok ? r : { ok: false, error: E.notFound };
    }
    case "story": {
      const r = await deleteEpisode(userId, node.id);
      return r.ok ? r : { ok: false, error: E.notFound };
    }
    case "person":
      return (await deletePerson(userId, node.id)) ? { ok: true } : { ok: false, error: E.notFound };
    case "place":
      return deletePlaceNode(userId, node.id);
    case "group":
      return deleteGroupNode(userId, node.id);
    case "placeGroup":
      return deletePlaceGroupNode(userId, node.id);
    default:
      return { ok: false, error: E.notFound };
  }
}

export async function addLinkAction(a: NodeRef, b: NodeRef): Promise<{ ok: true; created: CreatedLink[] } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const ra = ref(a);
  const rb = ref(b);
  if (!ra || !rb) return { ok: false, error: E.notFound };
  return addLink(userId, ra, rb);
}

export async function undoLinksAction(links: CreatedLink[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const clean = (Array.isArray(links) ? links : []).map((l) => ({ a: ref(l?.a), b: ref(l?.b) })).filter((l): l is CreatedLink => !!l.a && !!l.b);
  return undoLinks(userId, clean);
}

export async function removeLinkAction(a: NodeRef, b: NodeRef): Promise<{ ok: true; removed: number; undo: RemovedLink | null } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const ra = ref(a);
  const rb = ref(b);
  if (!ra || !rb) return { ok: false, error: E.notFound };
  return removeLink(userId, ra, rb);
}

// 빼기 되돌리기 — 화면이 돌려준 값은 쌍·소유·형식을 lib/node-graph restoreNodeLink 가 다시 검사한다.
export async function undoRemoveAction(u: RemovedLink): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const a = ref(u?.a);
  const b = ref(u?.b);
  if (!a || !b) return { ok: false, error: E.notFound };
  return undoRemove(userId, { a, b, rows: Array.isArray(u?.rows) ? u.rows : [] });
}

export async function moveStoryAction(episodeId: string, targetEventId: string): Promise<{ ok: true; key: string; undo: MoveUndo | null } | { ok: false; error: string }> {
  const userId = await requireUserId();
  if (typeof episodeId !== "string" || typeof targetEventId !== "string") return { ok: false, error: E.notFound };
  const r = await moveEpisodeToLifeEvent(userId, episodeId, targetEventId);
  return r.ok ? { ok: true, key: `st:${r.toEventId}:${episodeId}`, undo: r.undo } : { ok: false, error: E.notFound };
}

// 옮기기 되돌리기 — 화면이 돌려준 값은 lib/episode-move undoMoveEpisode 가 다시 검사한다. 되돌린 뒤 그 이야기 노드 키.
export async function undoMoveAction(u: MoveUndo): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const r = await undoMoveEpisode(userId, u);
  return r.ok ? { ok: true, key: `st:${u.fromEventId}:${u.episodeId}` } : { ok: false, error: r.reason === "not_found" ? E.notFound : E.cannotUndo };
}

export async function deleteImpactAction(node: NodeRef): Promise<DeleteImpact | null> {
  const userId = await requireUserId();
  const r = ref(node);
  return r ? deleteImpact(userId, r) : null;
}

// 지우기 — 이야기·직접 추가 시기·장소·모임·장소 묶음(사람은 /people 기존 삭제로 안내 — 여기서 받지 않음).
export async function deleteNodeAction(node: NodeRef): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const r = ref(node);
  if (!r) return { ok: false, error: E.notFound };
  if (r.type === "EPISODE") {
    const d = await deleteEpisode(userId, r.id);
    console.log("[my-life-delete]", { userId, type: r.type, id: r.id, ok: d.ok });
    return d.ok ? d : { ok: false, error: E.notFound };
  }
  if (r.type === "LIFE_EVENT") {
    const d = await deleteCustomLifeEvent(userId, r.id);
    console.log("[my-life-delete]", { userId, type: r.type, id: r.id, ok: d.ok });
    return d.ok ? d : { ok: false, error: E.deleteSkeletonNote };
  }
  if (r.type === "PLACE") return deletePlaceNode(userId, r.id);
  if (r.type === "PERSON_GROUP") return deleteGroupNode(userId, r.id);
  if (r.type === "PLACE_GROUP") return deletePlaceGroupNode(userId, r.id);
  return { ok: false, error: E.personDeleteNote };
}
