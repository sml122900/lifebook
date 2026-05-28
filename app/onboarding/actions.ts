"use server";

// 온보딩 저장 서버 액션. 사용자가 채운 답만 User/LifeProfile 에 반영하고
// onboardingCompletedAt 을 찍어 다시 온보딩으로 안 보내게 한다.
// pickString/Array/Int 는 클라가 보낸 임의 값을 타입·트림 검증하는 헬퍼.
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RawAnswers = Record<string, unknown>;

function pickString(answers: RawAnswers, key: string): string | undefined {
  const v = answers[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pickStringArray(answers: RawAnswers, key: string): string[] | undefined {
  const v = answers[key];
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  return cleaned.length === 0 ? undefined : cleaned;
}

function pickInt(answers: RawAnswers, key: string): number | undefined {
  const v = answers[key];
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    return undefined;
  }
  return v;
}

export async function saveOnboarding(answers: RawAnswers) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const birthYear = pickInt(answers, "birthYear");

  // 모든 질문을 건너뛰었더라도 항상 완료로 표시 — 다시 /onboarding 으로
  // 밀어내지 않기 위해.
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      onboardingCompletedAt: new Date(),
      ...(birthYear !== undefined ? { birthYear } : {}),
    },
  });

  // 사용자가 실제로 채운 LifeProfile 필드만 모은다 — 건너뛴 단계가 이전
  // 답을 덮어쓰지 않도록.
  const profileData: Record<string, string | string[]> = {};
  const arrayFields = [
    "interests",
    "schools",
    "residences",
    "favMovies",
    "favGames",
    "favMusic",
  ];
  for (const key of arrayFields) {
    const v = pickStringArray(answers, key);
    if (v) profileData[key] = v;
  }
  const stringFields = ["parentsInfo", "siblings", "closeFriends", "hobbies"];
  for (const key of stringFields) {
    const v = pickString(answers, key);
    if (v) profileData[key] = v;
  }

  if (Object.keys(profileData).length > 0) {
    await prisma.lifeProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...profileData },
      update: profileData,
    });
  }
}
