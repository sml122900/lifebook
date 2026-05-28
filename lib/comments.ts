// Phase 9.4 — 댓글 헬퍼.
//
// 프라이버시 불변식: 모든 읽기/쓰기는 그 댓글의 roomId 에 대한 "동의
// 멤버십" 확인을 거친다. 호출자는 viewer 와 room 을 넘긴다 — targetId
// 단독으로 댓글을 조회하지 말 것. 안 그러면 룸 B 멤버가 추억 id 만 알고
// 룸 A 의 댓글을 읽을 수 있다.

import { prisma } from "./db";
import { getMembership } from "./rooms";

export type TargetType = "user_memory" | "shared_memory";

/**
 * 한 룸 안 여러 대상의 댓글을, 렌더 시 빠른 조회를 위해 targetId 키로
 * 묶어 반환. viewer 가 동의 멤버가 아니면 null.
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

  // 대상이 "이" 룸의 동의 멤버 소유인지 확인. 이 체크가 없으면 악의적
  // 페이로드가 룸 B 에만 있는 추억에 룸 A 의 댓글을 붙일 수 있다.
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
  // deleteMany 의 조건 범위가 두 번 쿼리 없이 안전하게 만드는 트릭:
  // 행이 있고 authorId 가 맞으면 삭제, 아니면 no-op(에러도 누수도 없음).
  const res = await prisma.comment.deleteMany({
    where: { id: commentId, authorId: userId },
  });
  if (res.count === 0) {
    throw new Error("comment not found or not yours");
  }
}
