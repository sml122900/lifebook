"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { joinViaInvite } from "@/lib/rooms";

// Phase 9.2 — 명시 동의 합류 액션. 페이지는 체크 안 된 동의 체크박스 +
// 합류 버튼을 렌더하고, 사용자가 제출할 때만 이 액션에 도달한다.
// 자동 합류·묵시 동의 없음.
//
// "agree" 가 FormData 에 실제로 있었는지 재확인 — 체크박스 없이 손으로
// 만든 POST 도 거부한다.
export async function joinRoomAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const token = formData.get("token");
  const agree = formData.get("agree");
  if (typeof token !== "string" || token === "") {
    throw new Error("missing invite token");
  }
  if (agree !== "on") {
    throw new Error("must agree to join");
  }

  const { roomId } = await joinViaInvite(session.user.id, token);
  redirect(`/rooms/${roomId}`);
}
