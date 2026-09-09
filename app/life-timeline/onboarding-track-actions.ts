"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// v3 P17-3 — v2 사용자가 /life-timeline 전환 배너에서 명시적으로 선택할
// 때만 V3 트랙으로 바꾼다(자동 전환 절대 없음). v2 데이터(UserMemory 등)는
// 그대로 두고 온보딩 트랙만 바꿔 /start 로 보낸다 — 데이터 마이그레이션 없음.
export async function switchToV3Action() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingTrack: "V3" },
  });

  redirect("/start");
}
