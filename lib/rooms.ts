// Phase 9 — shared room helpers.
//
// Single source of truth for membership checks. Anywhere in the app
// that reads room-scoped data must call ensureRoomMembership() first.
// Returning the membership row (not a boolean) lets callers branch on
// role / consent without a second query.

import { prisma } from "./db";

export type Membership = Awaited<
  ReturnType<typeof prisma.roomMember.findUnique>
>;

/**
 * Returns the membership row if the user is a CONSENTED member of the
 * room, otherwise null. Invited-but-not-consented members are treated
 * as non-members for room data access.
 */
export async function getMembership(userId: string, roomId: string) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: {
      id: true,
      roomId: true,
      userId: true,
      role: true,
      consentAt: true,
      joinedAt: true,
    },
  });
  if (!member || !member.consentAt) return null;
  return member;
}

export async function createRoom(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("room name required");
  if (trimmed.length > 50) throw new Error("room name too long");

  return await prisma.$transaction(async (tx) => {
    const room = await tx.sharedRoom.create({
      data: { name: trimmed, ownerId: userId },
      select: { id: true, name: true, createdAt: true },
    });
    // Owner consents implicitly by creating the room — their data was
    // already private to them, so we just record the timestamp.
    await tx.roomMember.create({
      data: {
        roomId: room.id,
        userId,
        role: "owner",
        consentAt: new Date(),
      },
    });
    return room;
  });
}

/**
 * Rooms the user has joined (consented to). Owner rows are included
 * because their consentAt is set at creation.
 */
export async function listUserRooms(userId: string) {
  return await prisma.roomMember.findMany({
    where: { userId, consentAt: { not: null } },
    select: {
      role: true,
      joinedAt: true,
      room: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { joinedAt: "desc" },
  });
}
