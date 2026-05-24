"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  saveTimemachineMonth,
  type TimemachineMonthData,
} from "@/lib/timemachine-memories";

// 한 달치 저장. 클라이언트의 MonthForm 이 직접 호출.
// userId 는 서버 세션에서만 — 클라가 보낸 값 절대 신뢰 안 함.
export async function saveTimemachineMonthAction(
  year: number,
  month: number,
  data: TimemachineMonthData,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  await saveTimemachineMonth(session.user.id, year, month, data);
  // 같은 페이지로 돌아왔을 때 새 저장값을 보도록 캐시 무효화.
  revalidatePath(`/timemachine/${year}/${month}`);
}
