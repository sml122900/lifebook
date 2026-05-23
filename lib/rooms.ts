// Phase 9 — shared room helpers.
//
// Single source of truth for membership checks. Anywhere in the app
// that reads room-scoped data must call ensureRoomMembership() first.
// Returning the membership row (not a boolean) lets callers branch on
// role / consent without a second query.

import { randomBytes } from "node:crypto";

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
 * Issue a new invite for an existing room. Only consented members can
 * issue invites; the URL token is 256 bits of randomness, base64url-
 * encoded (no sequential ids, no guessable tokens). Phase 9.2 leaves
 * expiry / single-use intentionally out of scope.
 */
export async function createInvite(
  userId: string,
  roomId: string,
): Promise<{ token: string }> {
  const membership = await getMembership(userId, roomId);
  if (!membership) {
    throw new Error("not a member of this room");
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.roomInvite.create({
    data: { token, roomId, invitedBy: userId },
  });
  return { token };
}

export async function getInviteForJoin(token: string) {
  return prisma.roomInvite.findUnique({
    where: { token },
    select: {
      id: true,
      roomId: true,
      room: { select: { id: true, name: true } },
      inviter: { select: { name: true, email: true } },
    },
  });
}

/**
 * Idempotent join. Creates a new RoomMember row with consentAt=now()
 * on first run; flips an existing null-consent row to consented on
 * re-entry. Already-consented members are a no-op (just returns the
 * room id so the caller can redirect).
 *
 * The consent must come from a real user gesture upstream (the join
 * page's checkbox + submit) — this helper trusts its caller to only
 * fire after the user explicitly agreed.
 */
export async function joinViaInvite(
  userId: string,
  token: string,
): Promise<{ roomId: string }> {
  return await prisma.$transaction(async (tx) => {
    const invite = await tx.roomInvite.findUnique({
      where: { token },
      select: { roomId: true },
    });
    if (!invite) throw new Error("invalid invite");

    await tx.roomMember.upsert({
      where: { roomId_userId: { roomId: invite.roomId, userId } },
      create: {
        roomId: invite.roomId,
        userId,
        role: "member",
        consentAt: new Date(),
      },
      update: {
        // Re-consenting refreshes the timestamp; explicit user gesture
        // every time we get here.
        consentAt: new Date(),
      },
    });
    return { roomId: invite.roomId };
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
