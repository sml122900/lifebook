"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { joinViaInvite } from "@/lib/rooms";

// Phase 9.2 — explicit-consent join action. The page renders an
// unchecked agreement checkbox and a join button; only when the user
// submits do we hit this action. No auto-join, no implicit consent.
//
// We re-check that "agree" was actually present in the FormData so
// even a hand-crafted POST without the checkbox is refused.
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
