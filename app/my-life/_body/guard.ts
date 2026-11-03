// 이야기 상세·글 고치기·이전 판 화면 공통 — 로그인(proxy 가 먼저 막음) + V3 사용자만(My Life 와 같은 기준).

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOnboardingTrack } from "@/lib/onboarding-track";

export async function requireV3UserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  if ((await getOnboardingTrack(userId)) !== "V3") redirect("/enter");
  return userId;
}

// 이전 판 시각(KST) — "2026년 11월 3일 오후 10:33". 오전/오후는 직접(서버 Intl 이 "PM" 으로 내는 환경이 있어 — 390 실측).
export function formatWhen(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = k.getUTCHours();
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${mm}`;
}
