// 동기부여 ② — 가족 소식 (양방향).
//
// 두 종류:
//   A. 새 반응  — 내 기록(UserMemory)에 가족이 남긴 스탬프/댓글 (어르신 쪽)
//   B. 새 이야기 — 같은 룸 가족이 새로 남긴 타임머신 기록 (자녀 쪽)
//
// "새것" = 활동 createdAt > FamilyFeedSeen 의 해당 seenAt. 사용자가
// /timemachine 메인에서 소식을 실제로 보면(클라 mount) markSeen 으로
// 시각을 갱신 → 다음 접속 때 배지에서 빠진다.
//
// privacy: 새 반응은 "내 기록"에 달린 것만 (반응 생성 시 룸 멤버십 가드를
// 이미 통과). 새 이야기는 내가 동의 멤버인 룸의 다른 멤버 것만.

import { cache } from "react";

import { prisma } from "./db";
import { isStampKind, stampText, type StampKind } from "./reactions-policy";

const TIMEMACHINE_VIA = ["timemachine_event", "timemachine_month"];

function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

// 사용자당 1행. 없으면 now() 기준선으로 생성 (과거 활동 소급 폭주 방지).
async function getFeedSeen(userId: string) {
  const existing = await prisma.familyFeedSeen.findUnique({
    where: { userId },
    select: { reactionsSeenAt: true, recordsSeenAt: true },
  });
  if (existing) return existing;
  try {
    return await prisma.familyFeedSeen.create({
      data: { userId },
      select: { reactionsSeenAt: true, recordsSeenAt: true },
    });
  } catch (e) {
    if (!isP2002(e)) throw e;
    // 동시 생성 경합 — 패배자는 다시 읽어온다.
    return (await prisma.familyFeedSeen.findUnique({
      where: { userId },
      select: { reactionsSeenAt: true, recordsSeenAt: true },
    }))!;
  }
}

export type ReactionNewsItem = {
  roomId: string;
  memoryId: string;
  year: number;
  month: number | null;
  memoryTitle: string;
  reactorName: string;
  kind: "stamp" | "comment";
  stamp: StampKind | null; // kind==="stamp" 일 때만
  detail: string; // 스탬프 텍스트 또는 댓글 미리보기
  at: Date;
};

export type RecordNewsItem = {
  roomId: string;
  authorName: string;
  year: number;
  month: number | null;
  at: Date;
};

export type FamilyNews = {
  newReactions: { count: number; items: ReactionNewsItem[] };
  newRecords: { count: number; items: RecordNewsItem[] };
};

const ITEM_CAP = 8;

// 내가 동의 멤버인 룸 → 그 룸들의 (다른) 멤버 맵.
async function myRoomsAndOtherMembers(userId: string): Promise<{
  roomIds: string[];
  authorRoom: Map<string, string>; // 다른 멤버 userId → 대표 roomId (링크용)
}> {
  const myMemberships = await prisma.roomMember.findMany({
    where: { userId, consentAt: { not: null } },
    select: { roomId: true },
  });
  const roomIds = myMemberships.map((m) => m.roomId);
  if (roomIds.length === 0) return { roomIds: [], authorRoom: new Map() };

  const others = await prisma.roomMember.findMany({
    where: {
      roomId: { in: roomIds },
      consentAt: { not: null },
      userId: { not: userId },
    },
    select: { roomId: true, userId: true },
  });
  const authorRoom = new Map<string, string>();
  for (const o of others) {
    if (!authorRoom.has(o.userId)) authorRoom.set(o.userId, o.roomId);
  }
  return { roomIds, authorRoom };
}

export async function getFamilyNews(userId: string): Promise<FamilyNews> {
  const empty: FamilyNews = {
    newReactions: { count: 0, items: [] },
    newRecords: { count: 0, items: [] },
  };

  const { authorRoom } = await myRoomsAndOtherMembers(userId);
  // 룸이 없으면 가족 소식 자체가 없음 (조용히 빈 상태).
  if (authorRoom.size === 0) return empty;

  const seen = await getFeedSeen(userId);

  // ── A. 내 기록에 달린 새 반응 (스탬프 + 댓글) ──
  const myMemories = await prisma.userMemory.findMany({
    where: { userId },
    select: { id: true, year: true, month: true, title: true },
  });
  const myMemoryMap = new Map(myMemories.map((m) => [m.id, m]));
  const myMemoryIds = myMemories.map((m) => m.id);

  const reactionItems: ReactionNewsItem[] = [];
  if (myMemoryIds.length > 0) {
    const [stamps, comments] = await Promise.all([
      prisma.memoryReaction.findMany({
        where: {
          targetType: "user_memory",
          targetId: { in: myMemoryIds },
          authorId: { not: userId },
          createdAt: { gt: seen.reactionsSeenAt },
        },
        select: {
          roomId: true,
          targetId: true,
          stamp: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: {
          targetType: "user_memory",
          targetId: { in: myMemoryIds },
          authorId: { not: userId },
          createdAt: { gt: seen.reactionsSeenAt },
        },
        select: {
          roomId: true,
          targetId: true,
          content: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    for (const s of stamps) {
      const mem = myMemoryMap.get(s.targetId);
      if (!mem) continue;
      const stamp = isStampKind(s.stamp) ? s.stamp : null;
      reactionItems.push({
        roomId: s.roomId,
        memoryId: s.targetId,
        year: mem.year,
        month: mem.month,
        memoryTitle: mem.title,
        reactorName: s.author.name ?? s.author.email ?? "가족",
        kind: "stamp",
        stamp,
        detail: stamp ? stampText(stamp) : "반응",
        at: s.createdAt,
      });
    }
    for (const c of comments) {
      const mem = myMemoryMap.get(c.targetId);
      if (!mem) continue;
      reactionItems.push({
        roomId: c.roomId,
        memoryId: c.targetId,
        year: mem.year,
        month: mem.month,
        memoryTitle: mem.title,
        reactorName: c.author.name ?? c.author.email ?? "가족",
        kind: "comment",
        stamp: null,
        detail: c.content.length > 40 ? c.content.slice(0, 40) + "…" : c.content,
        at: c.createdAt,
      });
    }
    reactionItems.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  // ── B. 가족(다른 멤버)의 새 타임머신 기록 ──
  const otherIds = Array.from(authorRoom.keys());
  const newMemRows = await prisma.userMemory.findMany({
    where: {
      userId: { in: otherIds },
      createdVia: { in: TIMEMACHINE_VIA },
      createdAt: { gt: seen.recordsSeenAt },
    },
    select: {
      userId: true,
      year: true,
      month: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  // (author, year, month) 단위로 묶음 — 한 달 저장이 여러 행이라 과다 카운트 방지.
  const recordGroups = new Map<string, RecordNewsItem>();
  for (const r of newMemRows) {
    if (r.month === null) continue;
    const key = `${r.userId}-${r.year}-${r.month}`;
    const existing = recordGroups.get(key);
    if (!existing) {
      recordGroups.set(key, {
        roomId: authorRoom.get(r.userId)!,
        authorName: r.user.name ?? r.user.email ?? "가족",
        year: r.year,
        month: r.month,
        at: r.createdAt,
      });
    } else if (r.createdAt > existing.at) {
      existing.at = r.createdAt;
    }
  }
  const recordItems = Array.from(recordGroups.values()).sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  );

  return {
    newReactions: {
      count: reactionItems.length,
      items: reactionItems.slice(0, ITEM_CAP),
    },
    newRecords: {
      count: recordItems.length,
      items: recordItems.slice(0, ITEM_CAP),
    },
  };
}

// 사이드 패널 배지용 — 개수만. 룸 없으면 0.
async function _getFamilyNewsCount(
  userId: string,
): Promise<{ reactions: number; records: number; total: number }> {
  const { authorRoom } = await myRoomsAndOtherMembers(userId);
  if (authorRoom.size === 0) return { reactions: 0, records: 0, total: 0 };

  const seen = await getFeedSeen(userId);

  const myMemoryIds = (
    await prisma.userMemory.findMany({
      where: { userId },
      select: { id: true },
    })
  ).map((m) => m.id);

  const otherIds = Array.from(authorRoom.keys());

  const [stampCount, commentCount, recordRows] = await Promise.all([
    myMemoryIds.length === 0
      ? Promise.resolve(0)
      : prisma.memoryReaction.count({
          where: {
            targetType: "user_memory",
            targetId: { in: myMemoryIds },
            authorId: { not: userId },
            createdAt: { gt: seen.reactionsSeenAt },
          },
        }),
    myMemoryIds.length === 0
      ? Promise.resolve(0)
      : prisma.comment.count({
          where: {
            targetType: "user_memory",
            targetId: { in: myMemoryIds },
            authorId: { not: userId },
            createdAt: { gt: seen.reactionsSeenAt },
          },
        }),
    prisma.userMemory.findMany({
      where: {
        userId: { in: otherIds },
        createdVia: { in: TIMEMACHINE_VIA },
        createdAt: { gt: seen.recordsSeenAt },
      },
      select: { userId: true, year: true, month: true },
    }),
  ]);

  // 새 기록은 (author, year, month) distinct.
  const recordKeys = new Set<string>();
  for (const r of recordRows) {
    if (r.month === null) continue;
    recordKeys.add(`${r.userId}-${r.year}-${r.month}`);
  }

  const reactions = stampCount + commentCount;
  const records = recordKeys.size;
  return { reactions, records, total: reactions + records };
}
export const getFamilyNewsCount = cache(_getFamilyNewsCount);

// seenAt 은 DB 시계(NOW())로 — baseline(@default(now()))·활동 createdAt 과
// 같은 시계라 "봤는데 안 빠짐"(서버/DB 시계 어긋남) 차단. 행은 보통
// getFeedSeen 이 이미 만들어 둠. 없으면 create(둘 다 DB now() 기준선).
export async function markReactionsSeen(userId: string): Promise<void> {
  const affected = await prisma.$executeRaw`
    UPDATE "FamilyFeedSeen"
    SET "reactionsSeenAt" = NOW(), "updatedAt" = NOW()
    WHERE "userId" = ${userId}`;
  if (affected === 0) await ensureFeedSeenRow(userId);
}

export async function markRecordsSeen(userId: string): Promise<void> {
  const affected = await prisma.$executeRaw`
    UPDATE "FamilyFeedSeen"
    SET "recordsSeenAt" = NOW(), "updatedAt" = NOW()
    WHERE "userId" = ${userId}`;
  if (affected === 0) await ensureFeedSeenRow(userId);
}

// 행이 없을 때만(드문 방어 경로) — create 의 @default(now()) 가 DB 시계.
async function ensureFeedSeenRow(userId: string): Promise<void> {
  try {
    await prisma.familyFeedSeen.create({ data: { userId } });
  } catch (e) {
    if (!isP2002(e)) throw e; // 동시 생성 경합 — 이미 생겼으면 OK
  }
}
