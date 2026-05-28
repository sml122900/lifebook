"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { setReaction, type ReactionTargetType } from "@/lib/reactions";
import { isStampKind } from "@/lib/reactions-policy";

const TARGET_TYPES: readonly ReactionTargetType[] = [
  "user_memory",
  "shared_memory",
];

// 스탬프 켜기/끄기. userId 는 서버 세션에서만 — 클라가 보낸 값 신뢰 안 함.
export async function setReactionAction(input: {
  roomId: string;
  targetType: string;
  targetId: string;
  stamp: string;
  active: boolean;
}): Promise<{ active: boolean }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const { roomId, targetType, targetId, stamp, active } = input;
  if (typeof roomId !== "string" || roomId === "") throw new Error("roomId required");
  if (typeof targetId !== "string" || targetId === "") throw new Error("targetId required");
  if (typeof active !== "boolean") throw new Error("active required");
  if (!TARGET_TYPES.includes(targetType as ReactionTargetType)) {
    throw new Error("invalid targetType");
  }
  if (!isStampKind(stamp)) throw new Error("invalid stamp");

  const res = await setReaction(
    session.user.id,
    roomId,
    targetType as ReactionTargetType,
    targetId,
    stamp,
    active,
  );

  revalidatePath(`/rooms/${roomId}`);
  return res;
}
