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
  // 출석 보너스로 토큰 잔액·streak 이 바뀐다. 잔액은 루트 레이아웃 사이드 패널이
  // 들고 있으므로 레이아웃까지 무효화해야 패널이 새 값으로 갱신된다.
  revalidatePath("/", "layout");
  return result;
}
