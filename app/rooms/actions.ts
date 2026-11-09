"use server";

// 가족 룸 생성 + 초대 링크 발급 서버 액션. userId 는 세션에서만.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { closeRoom, createInvite, createRoom, leaveRoom } from "@/lib/rooms";

export async function createRoomAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const name = formData.get("name");
  if (typeof name !== "string") {
    throw new Error("name required");
  }
  // 룸 주인 동의(2026-11-09 성민 C) — 체크칸 없이 손으로 만든 POST 도 거부(초대 수락 joinRoomAction 과 같은 방식).
  if (formData.get("agree") !== "on") {
    throw new Error("must agree to share");
  }
  const room = await createRoom(session.user.id, name, true);
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

// 룸 나가기(멤버)·룸 닫기(주인) — 2026-11-09 성민. 화면이 확인 단계를 거친 뒤 부른다. 끝나면 룸 목록으로.
function roomIdOf(formData: FormData): string {
  const roomId = formData.get("roomId");
  if (typeof roomId !== "string" || roomId === "") throw new Error("roomId required");
  return roomId;
}

export async function leaveRoomAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const roomId = roomIdOf(formData);
  const r = await leaveRoom(session.user.id, roomId);
  if (r === "owner") throw new Error("owner must close the room");
  revalidatePath("/rooms");
  revalidatePath(`/rooms/${roomId}`);
  redirect("/rooms");
}

export async function closeRoomAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const roomId = roomIdOf(formData);
  if ((await closeRoom(session.user.id, roomId)) !== "closed") throw new Error("only the owner can close the room");
  revalidatePath("/rooms");
  redirect("/rooms");
}
