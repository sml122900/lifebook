"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { processAttendance, type CheckInResult } from "@/lib/attendance";

// userId 는 서버 세션에서만 — 클라가 보낸 값 절대 신뢰 안 함.
export async function checkInAction(): Promise<CheckInResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  const result = await processAttendance(session.user.id);
  // /timemachine 페이지가 RSC 로 streak 표시 — 갱신 후 새 값 보이게.
  revalidatePath("/timemachine");
  return result;
}
