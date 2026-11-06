"use server";

// 노드 본문(블로그식 글) 액션 — auth 게이트 + revalidate 만(본체는 lib/node-body.ts). 2026-11-03 2b-3c
// (docs/phase/my-life-restructure.md §19). 쓰는 곳 = /my-life/story/[id]/edit · /my-life/person/[id]/edit · 이전 판 화면.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  ensureItemBodyMemory,
  ensurePersonBodyMemory,
  restoreRevision,
  saveEpisodeBody,
  saveItemBody,
  savePersonBody,
  type BodyNodeType,
  type SaveBodyResult,
} from "@/lib/node-body";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// My Life 지도(본문 첫 줄·글 있음 표시)와 이 노드의 상세·편집·이전 판. (/people 상세 무효화는 2026-11-06 인물록 통합으로 삭제 — V3 → My Life)
function revalidateNode(nodeType: BodyNodeType, nodeId: string) {
  revalidatePath("/my-life");
  if (nodeType === "EPISODE") {
    revalidatePath(`/my-life/story/${nodeId}`, "layout");
  } else if (nodeType === "PERSON") {
    revalidatePath(`/my-life/person/${nodeId}`, "layout");
  } else {
    revalidatePath(`/my-life/item/${nodeId}`, "layout"); // 사용자 항목 글(custom-graph 2단계)
  }
}

export async function saveEpisodeBodyAction(episodeId: string, doc: unknown, baseVersion: number): Promise<SaveBodyResult> {
  const userId = await requireUserId();
  const r = await saveEpisodeBody(userId, episodeId, doc, baseVersion);
  if (r.ok) revalidateNode("EPISODE", episodeId);
  return r;
}

export async function savePersonBodyAction(personId: string, doc: unknown, baseVersion: number): Promise<SaveBodyResult> {
  const userId = await requireUserId();
  const r = await savePersonBody(userId, personId, doc, baseVersion);
  if (r.ok) revalidateNode("PERSON", personId);
  return r;
}

// 인물 글에 사진을 올리기 전 — 사진이 붙을 메모리 id(없으면 만듦).
export async function preparePersonBodyPhotoAction(personId: string): Promise<{ ok: true; memoryId: string } | { ok: false }> {
  const userId = await requireUserId();
  const memoryId = await ensurePersonBodyMemory(userId, personId);
  return memoryId ? { ok: true, memoryId } : { ok: false };
}

// 사용자 항목 글(custom-graph 2단계 — Q78) — 인물 글과 같은 두 액션.
export async function saveItemBodyAction(itemId: string, doc: unknown, baseVersion: number): Promise<SaveBodyResult> {
  const userId = await requireUserId();
  const r = await saveItemBody(userId, itemId, doc, baseVersion);
  if (r.ok) revalidateNode("CUSTOM", itemId);
  return r;
}

export async function prepareItemBodyPhotoAction(itemId: string): Promise<{ ok: true; memoryId: string } | { ok: false }> {
  const userId = await requireUserId();
  const memoryId = await ensureItemBodyMemory(userId, itemId);
  return memoryId ? { ok: true, memoryId } : { ok: false };
}

export async function restoreRevisionAction(revisionId: string, baseVersion: number): Promise<SaveBodyResult> {
  const userId = await requireUserId();
  const { nodeType, nodeId, ...r } = await restoreRevision(userId, revisionId, baseVersion);
  if (r.ok && nodeType && nodeId) revalidateNode(nodeType, nodeId);
  return r;
}
