"use server";

// 가족 룸 생성 + 초대 링크 발급 서버 액션. userId 는 세션에서만.
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
  // createInvite 가 멤버십을 이미 검증한다.
  await createInvite(session.user.id, roomId);
  revalidatePath(`/rooms/${roomId}`);
}
