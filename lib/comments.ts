// Phase 9.4 — comment helpers.
//
// Privacy invariant: every read/write goes through a consented
// membership check on the comment's roomId. Caller passes the viewer
// and the room — never look up comments by targetId alone, or a
// member of room B could read comments that belong to room A simply
// by knowing a memory id.

import { prisma } from "./db";
import { getMembership } from "./rooms";

export type TargetType = "user_memory" | "shared_memory";

/**
 * Returns comments for a set of targets within a single room, keyed
 * by targetId for fast lookup at render time. null if the viewer
 * isn't a consented member.
 */
export async function listRoomCommentsByTarget(
  roomId: string,
  viewerUserId: string,
  targetType: TargetType,
  targetIds: string[],
): Promise<Map<string, Awaited<ReturnType<typeof loadByTargets>>> | null> {
  const membership = await getMembership(viewerUserId, roomId);
  if (!membership) return null;
  if (targetIds.length === 0) return new Map();

  const rows = await loadByTargets(roomId, targetType, targetIds);
  const map = new Map<string, typeof rows>();
  for (const id of targetIds) map.set(id, []);
  for (const c of rows) {
    const list = map.get(c.targetId);
    if (list) list.push(c);
  }
  return map;
}

function loadByTargets(
  roomId: string,
  targetType: TargetType,
  targetIds: string[],
) {
  return prisma.comment.findMany({
    where: { roomId, targetType, targetId: { in: targetIds } },
    select: {
      id: true,
      targetId: true,
      authorId: true,
      content: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createComment(
  authorId: string,
  roomId: string,
  targetType: TargetType,
  targetId: string,
  content: string,
): Promise<void> {
  const trimmed = content.trim();
  if (trimmed === "") throw new Error("empty comment");
  if (trimmed.length > 2000) throw new Error("comment too long");

  const membership = await getMembership(authorId, roomId);
  if (!membership) throw new Error("not a member of this room");

  // Verify the target belongs to a consented member of THIS room.
  // Without this check, a malicious payload could attach a comment in
  // room A to a memory that only exists in room B.
  if (targetType === "user_memory") {
    const memberIds = await prisma.roomMember.findMany({
      where: { roomId, consentAt: { not: null } },
      select: { userId: true },
    });
    const ids = new Set(memberIds.map((m) => m.userId));
    const target = await prisma.userMemory.findUnique({
      where: { id: targetId },
      select: { userId: true },
    });
    if (!target || !ids.has(target.userId)) {
      throw new Error("target not visible in this room");
    }
  }

  await prisma.comment.create({
    data: { roomId, targetType, targetId, authorId, content: trimmed },
  });
}

export async function deleteComment(
  commentId: string,
  userId: string,
): Promise<void> {
  // updateMany / deleteMany scoping is the trick that makes this safe
  // without two queries: if the row exists and authorId matches, delete;
  // otherwise it's a no-op (no error / no leak).
  const res = await prisma.comment.deleteMany({
    where: { id: commentId, authorId: userId },
  });
  if (res.count === 0) {
    throw new Error("comment not found or not yours");
  }
}
