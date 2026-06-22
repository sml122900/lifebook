"use server";

// 채팅 온보딩 완료 액션.
// User.birthYear / User.region / User.onboardingCompletedAt + LifeProfile 저장.
// redirect 는 호출자(클라)가 담당.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type ParsedAnswers = {
  birthYear?: number;
  region?: string;
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

export async function completeOnboardingChat(answers: ParsedAnswers): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const userUpdate: Record<string, unknown> = { onboardingCompletedAt: new Date() };
  if (answers.birthYear !== undefined) userUpdate.birthYear = answers.birthYear;
  if (answers.region?.trim()) userUpdate.region = answers.region.trim();

  await prisma.user.update({ where: { id: userId }, data: userUpdate });

  const profileData: Record<string, string | string[]> = {};
  const arrayFields = [
    "interests", "schools", "residences", "favMovies", "favGames", "favMusic",
  ] as const;
  for (const key of arrayFields) {
    const v = answers[key];
    if (v && v.length > 0) profileData[key] = v;
  }
  const strFields = ["parentsInfo", "siblings", "closeFriends", "hobbies"] as const;
  for (const key of strFields) {
    const v = answers[key];
    if (v?.trim()) profileData[key] = v.trim();
  }

  if (Object.keys(profileData).length > 0) {
    await prisma.lifeProfile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData,
    });
  }
}
