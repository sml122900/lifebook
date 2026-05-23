"use server";

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

  if (birthYear !== undefined) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { birthYear },
    });
  }

  // Collect only the LifeProfile fields the user actually filled in,
  // so a skipped step never overwrites a previous answer.
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
