// Phase 9.6 — shared memory CRUD helpers.
//
// Authorization rules:
//   - any consented room member can create / edit (room co-ownership)
//   - delete is restricted to the original author OR the room owner
// Every helper verifies membership against the row's roomId — never
// trust a roomId from the caller without also checking the memory
// belongs to it.

import { prisma } from "./db";
import { getMembership } from "./rooms";

const CURRENT_YEAR = new Date().getFullYear();

function validateBody(input: {
  year: number;
  month?: number | null;
  title: string;
  content?: string | null;
}): void {
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > CURRENT_YEAR) {
    throw new Error("invalid year");
  }
  if (
    input.month != null &&
    (!Number.isInteger(input.month) || input.month < 1 || input.month > 12)
  ) {
    throw new Error("invalid month");
  }
  const t = input.title.trim();
  if (t === "") throw new Error("title required");
  if (t.length > 100) throw new Error("title too long");
  if (input.content && input.content.length > 5000) throw new Error("content too long");
}

export async function listSharedMemories(roomId: string, viewerUserId: string) {
  const membership = await getMembership(viewerUserId, roomId);
  if (!membership) return null;

  return prisma.sharedMemory.findMany({
    where: { roomId },
    select: {
      id: true,
      roomId: true,
      year: true,
      month: true,
      title: true,
      content: true,
      createdById: true,
      createdBy: { select: { name: true, email: true } },
      lastEditedById: true,
      lastEditedBy: { select: { name: true, email: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });
}

export async function createSharedMemory(
  userId: string,
  roomId: string,
  input: {
    year: number;
    month?: number | null;
    title: string;
    content?: string | null;
  },
): Promise<{ id: string }> {
  const membership = await getMembership(userId, roomId);
  if (!membership) throw new Error("not a member of this room");
  validateBody(input);

  const row = await prisma.sharedMemory.create({
    data: {
      roomId,
      year: input.year,
      month: input.month ?? null,
      title: input.title.trim(),
      content: input.content?.trim() || null,
      createdById: userId,
    },
    select: { id: true },
  });
  return row;
}

export async function getSharedMemoryForEdit(
  userId: string,
  memoryId: string,
) {
  const memory = await prisma.sharedMemory.findUnique({
    where: { id: memoryId },
    select: {
      id: true,
      roomId: true,
      year: true,
      month: true,
      title: true,
      content: true,
      createdById: true,
    },
  });
  if (!memory) return null;
  const membership = await getMembership(userId, memory.roomId);
  if (!membership) return null;
  return memory;
}

export async function updateSharedMemory(
  userId: string,
  memoryId: string,
  input: {
    year: number;
    month?: number | null;
    title: string;
    content?: string | null;
  },
): Promise<{ roomId: string }> {
  const memory = await prisma.sharedMemory.findUnique({
    where: { id: memoryId },
    select: { roomId: true },
  });
  if (!memory) throw new Error("memory not found");

  const membership = await getMembership(userId, memory.roomId);
  if (!membership) throw new Error("not a member of this room");

  validateBody(input);

  await prisma.sharedMemory.update({
    where: { id: memoryId },
    data: {
      year: input.year,
      month: input.month ?? null,
      title: input.title.trim(),
      content: input.content?.trim() || null,
      lastEditedById: userId,
    },
  });
  return { roomId: memory.roomId };
}

export async function deleteSharedMemory(
  userId: string,
  memoryId: string,
): Promise<{ roomId: string }> {
  const memory = await prisma.sharedMemory.findUnique({
    where: { id: memoryId },
    select: {
      roomId: true,
      createdById: true,
      room: { select: { ownerId: true } },
    },
  });
  if (!memory) throw new Error("memory not found");

  const membership = await getMembership(userId, memory.roomId);
  if (!membership) throw new Error("not a member of this room");

  // Co-ownership for edit, but delete is tighter: only the original
  // author or the room owner can blow it away. Co-author can still
  // edit the title to "삭제됨" or similar if that's what they want.
  if (memory.createdById !== userId && memory.room.ownerId !== userId) {
    throw new Error("only the author or room owner can delete");
  }

  await prisma.sharedMemory.delete({ where: { id: memoryId } });
  return { roomId: memory.roomId };
}
