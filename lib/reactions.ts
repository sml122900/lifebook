// 동기부여 ② — 감정 스탬프 helpers.
//
// Comment 와 동일한 privacy 불변식: 모든 읽기/쓰기는 roomId 동의
// 멤버십 확인을 통과한다. targetId 단독으로 조회하지 않는다 — 룸 B 의
// 멤버가 룸 A 의 추억 id 만 알고 반응을 다는 일을 막는다.

import { prisma } from "./db";
import { isStampKind, type StampKind } from "./reactions-policy";
import { getMembership } from "./rooms";

export type ReactionTargetType = "user_memory" | "shared_memory";

const REACTION_TARGET_TYPES: readonly ReactionTargetType[] = [
  "user_memory",
  "shared_memory",
];

function isReactionTargetType(v: unknown): v is ReactionTargetType {
  return (
    typeof v === "string" &&
    (REACTION_TARGET_TYPES as readonly string[]).includes(v)
  );
}

function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * 스탬프 켜기/끄기. race-safe + idempotent:
 *   - active=true  → create. 동시/중복 클릭으로 이미 있으면 P2002 → 무시.
 *   - active=false → deleteMany. 이미 없으면 count 0 → 무시.
 * 토글 의미는 클라이언트가 현재 상태의 반대를 보내는 것으로 표현한다
 * (서버에서 read-then-write 하지 않아 경합 창이 없다).
 *
 * 권한: 반응하는 사람이 roomId 의 동의 멤버여야 하고, 대상(추억)이 그
 * 룸에서 보이는(= 동의 멤버 소유) 것이어야 한다. createComment 와 동일.
 *
 * @returns 최종 상태 (active)
 */
export async function setReaction(
  authorId: string,
  roomId: string,
  targetType: ReactionTargetType,
  targetId: string,
  stamp: StampKind,
  active: boolean,
): Promise<{ active: boolean }> {
  if (!isReactionTargetType(targetType)) throw new Error("invalid targetType");
  if (!isStampKind(stamp)) throw new Error("invalid stamp");

  const membership = await getMembership(authorId, roomId);
  if (!membership) throw new Error("not a member of this room");

  // 대상이 이 룸의 동의 멤버 소유인지 — createComment 와 같은 가드.
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
  } else {
    // shared_memory — 룸 소유 추억. roomId 일치만 확인.
    const target = await prisma.sharedMemory.findUnique({
      where: { id: targetId },
      select: { roomId: true },
    });
    if (!target || target.roomId !== roomId) {
      throw new Error("target not visible in this room");
    }
  }

  if (active) {
    try {
      await prisma.memoryReaction.create({
        data: { roomId, targetType, targetId, authorId, stamp },
      });
    } catch (e) {
      if (!isP2002(e)) throw e; // 이미 있으면 idempotent
    }
    return { active: true };
  }

  await prisma.memoryReaction.deleteMany({
    where: { roomId, targetType, targetId, authorId, stamp },
  });
  return { active: false };
}

export type TargetReaction = {
  id: string;
  authorId: string;
  stamp: string;
  author: { name: string | null; email: string | null };
};

/**
 * 룸 안 여러 대상의 스탬프를 targetId 키로 묶어 반환. 멤버 아니면 null.
 * 렌더 시 stamp 별 카운트 + 누가 눌렀는지 + 내가 눌렀는지 계산에 사용.
 */
export async function listReactionsByTarget(
  roomId: string,
  viewerUserId: string,
  targetType: ReactionTargetType,
  targetIds: string[],
): Promise<Map<string, TargetReaction[]> | null> {
  const membership = await getMembership(viewerUserId, roomId);
  if (!membership) return null;
  if (targetIds.length === 0) return new Map();

  const rows = await prisma.memoryReaction.findMany({
    where: { roomId, targetType, targetId: { in: targetIds } },
    select: {
      id: true,
      targetId: true,
      authorId: true,
      stamp: true,
      author: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, TargetReaction[]>();
  for (const id of targetIds) map.set(id, []);
  for (const r of rows) {
    const list = map.get(r.targetId);
    if (list) {
      list.push({
        id: r.id,
        authorId: r.authorId,
        stamp: r.stamp,
        author: r.author,
      });
    }
  }
  return map;
}
