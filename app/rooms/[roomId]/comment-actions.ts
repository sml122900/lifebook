"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  createComment,
  deleteComment,
  type TargetType,
} from "@/lib/comments";

const TARGET_TYPES: readonly TargetType[] = ["user_memory", "shared_memory"];

export async function createCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const roomId = formData.get("roomId");
  const targetType = formData.get("targetType");
  const targetId = formData.get("targetId");
  const content = formData.get("content");

  if (typeof roomId !== "string" || roomId === "") throw new Error("roomId required");
  if (typeof targetId !== "string" || targetId === "") throw new Error("targetId required");
  if (typeof content !== "string") throw new Error("content required");
  if (
    typeof targetType !== "string" ||
    !TARGET_TYPES.includes(targetType as TargetType)
  ) {
    throw new Error("invalid targetType");
  }

  await createComment(
    session.user.id,
    roomId,
    targetType as TargetType,
    targetId,
    content,
  );

  revalidatePath(`/rooms/${roomId}`);
}

export async function deleteCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const commentId = formData.get("commentId");
  const roomId = formData.get("roomId");
  if (typeof commentId !== "string" || commentId === "") throw new Error("commentId required");
  if (typeof roomId !== "string" || roomId === "") throw new Error("roomId required");

  await deleteComment(commentId, session.user.id);

  revalidatePath(`/rooms/${roomId}`);
}
