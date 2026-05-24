"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 회원정보 저장 — 온보딩 saveOnboarding과 같은 정제 로직을 쓰되
// onboardingCompletedAt은 절대 덮어쓰지 않는다 (이미 완료된 사용자).
// 빈 값은 명시적으로 비우는 의도이므로 빈 배열/빈 문자열로 그대로 반영.
type ProfileInput = {
  birthYear?: number | null;
  interests?: string[];
  residences?: string[];
  schools?: string[];
  favMovies?: string[];
  favGames?: string[];
  favMusic?: string[];
  siblings?: string;
  parentsInfo?: string;
  closeFriends?: string;
  hobbies?: string;
};

function cleanArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

function cleanString(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

function cleanInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    return null;
  }
  const y = v;
  const max = new Date().getFullYear();
  if (y < 1900 || y > max) return null;
  return y;
}

export async function saveProfile(input: ProfileInput) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const userId = session.user.id;

  const birthYear = cleanInt(input.birthYear);

  await prisma.user.update({
    where: { id: userId },
    data: { birthYear },
  });

  // 비운 문자열은 null로 — schema에서 nullable이라 의미 그대로.
  const orNull = (s: string) => (s === "" ? null : s);
  const profileData = {
    interests: cleanArray(input.interests),
    residences: cleanArray(input.residences),
    schools: cleanArray(input.schools),
    favMovies: cleanArray(input.favMovies),
    favGames: cleanArray(input.favGames),
    favMusic: cleanArray(input.favMusic),
    siblings: orNull(cleanString(input.siblings)),
    parentsInfo: orNull(cleanString(input.parentsInfo)),
    closeFriends: orNull(cleanString(input.closeFriends)),
    hobbies: orNull(cleanString(input.hobbies)),
  };

  await prisma.lifeProfile.upsert({
    where: { userId },
    create: { userId, ...profileData },
    update: profileData,
  });

  // 타임라인이 birthYear를 사용 → 캐시 갱신.
  revalidatePath("/timeline");
}
