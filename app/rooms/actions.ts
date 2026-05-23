"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createInvite, createRoom } from "@/lib/rooms";

export async function createRoomAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const name = formData.get("name");
  if (typeof name !== "string") {
    throw new Error("name required");
  }
  const room = await createRoom(session.user.id, name);
  revalidatePath("/rooms");
  redirect(`/rooms/${room.id}`);
}

export async function createInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const roomId = formData.get("roomId");
  if (typeof roomId !== "string" || roomId === "") {
    throw new Error("roomId required");
  }
  // createInvite already verifies membership.
  await createInvite(session.user.id, roomId);
  revalidatePath(`/rooms/${roomId}`);
}
