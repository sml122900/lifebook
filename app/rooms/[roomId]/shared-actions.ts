"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  createSharedMemory,
  deleteSharedMemory,
  updateSharedMemory,
} from "@/lib/shared-memories";

function parseBody(formData: FormData) {
  const roomId = formData.get("roomId");
  const year = Number(formData.get("year"));
  const monthRaw = formData.get("month");
  const month = monthRaw === "" || monthRaw == null ? null : Number(monthRaw);
  const title = formData.get("title");
  const contentRaw = formData.get("content");
  const content = typeof contentRaw === "string" ? contentRaw : null;

  if (typeof roomId !== "string" || roomId === "") throw new Error("roomId required");
  if (typeof title !== "string") throw new Error("title required");
  if (!Number.isFinite(year)) throw new Error("year required");
  if (month !== null && !Number.isFinite(month)) throw new Error("invalid month");

  return { roomId, year, month, title, content };
}

export async function createSharedMemoryAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const { roomId, ...body } = parseBody(formData);
  await createSharedMemory(session.user.id, roomId, body);

  revalidatePath(`/rooms/${roomId}`);
}

export async function updateSharedMemoryAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const memoryId = formData.get("memoryId");
  if (typeof memoryId !== "string" || memoryId === "") {
    throw new Error("memoryId required");
  }
  const { roomId, ...body } = parseBody(formData);

  const { roomId: actualRoomId } = await updateSharedMemory(
    session.user.id,
    memoryId,
    body,
  );

  revalidatePath(`/rooms/${actualRoomId}`);
  // Trust the DB roomId over the form one in case of mismatch.
  redirect(`/rooms/${actualRoomId}`);
  // (kept here for type-checker; redirect throws)
  void roomId;
}

export async function deleteSharedMemoryAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const memoryId = formData.get("memoryId");
  if (typeof memoryId !== "string" || memoryId === "") {
    throw new Error("memoryId required");
  }

  const { roomId } = await deleteSharedMemory(session.user.id, memoryId);
  revalidatePath(`/rooms/${roomId}`);
}
