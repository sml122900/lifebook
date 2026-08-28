"use server";

// STAGE1 — 신상 온보딩 폼 제출 → OnboardingProfile 저장 + LifeEvent 골격 생성.
//
// 골격(generateSkeleton)은 이 파일 내부 순수 헬퍼(비export)다 — DB 접근이
// 없어 "use server" export 제약(async 함수만)과 무관하다. 학제 명칭만
// lib/constants/education-labels.ts(순수 모듈)에서 가져온다.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getElemSchoolLabel } from "@/lib/constants/education-labels";
import type { LifeEventType } from "@/lib/generated/prisma/enums";

const MIN_BIRTH_YEAR = 1920;
const MAX_BIRTH_YEAR = 2015;
const GENDERS = ["남", "여", "선택안함"] as const;
type Gender = (typeof GENDERS)[number];

function isGender(v: unknown): v is Gender {
  return typeof v === "string" && (GENDERS as readonly string[]).includes(v);
}

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

type SkeletonItem = {
  type: LifeEventType;
  label: string;
  year: number | null;
  isOptional: boolean;
  sequenceOrder: number;
};

// 순수 계산 — birthYear/gender 만으로 골격 이벤트 배열을 만든다. DB 미접근.
function generateSkeleton(birthYear: number, gender: Gender): SkeletonItem[] {
  const items: SkeletonItem[] = [];
  let order = 0;

  items.push({ type: "BIRTH", label: "출생", year: birthYear, isOptional: false, sequenceOrder: order++ });
  items.push({
    type: "ELEM_SCHOOL",
    label: `${getElemSchoolLabel(birthYear + 7)} 입학`,
    year: birthYear + 7,
    isOptional: false,
    sequenceOrder: order++,
  });
  items.push({ type: "MIDDLE_SCHOOL", label: "중학교 입학", year: birthYear + 13, isOptional: false, sequenceOrder: order++ });
  items.push({ type: "HIGH_SCHOOL", label: "고등학교 입학", year: birthYear + 16, isOptional: false, sequenceOrder: order++ });
  items.push({ type: "UNIVERSITY", label: "대학교 입학", year: birthYear + 19, isOptional: true, sequenceOrder: order++ });

  if (gender === "남") {
    items.push({ type: "MILITARY", label: "군 입대", year: birthYear + 20, isOptional: true, sequenceOrder: order++ });
  }

  items.push({ type: "FIRST_JOB", label: "첫 직장", year: null, isOptional: true, sequenceOrder: order++ });
  items.push({ type: "MARRIAGE", label: "결혼", year: null, isOptional: true, sequenceOrder: order++ });

  return items;
}

export type CompleteOnboardingInput = {
  birthYear: number;
  birthMonth: number | null;
  gender: string;
  region: string;
};

export type CompleteOnboardingResult =
  | { status: "CREATED"; count: number }
  | { status: "ALREADY_DONE" };

export async function completeOnboarding(
  userId: string,
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  await requireUserId(userId);

  if (
    !Number.isInteger(input.birthYear) ||
    input.birthYear < MIN_BIRTH_YEAR ||
    input.birthYear > MAX_BIRTH_YEAR
  ) {
    throw new Error("Invalid birthYear");
  }
  if (!isGender(input.gender)) throw new Error("Invalid gender");
  if (!input.region.trim()) throw new Error("Invalid region");
  const birthMonth =
    input.birthMonth !== null &&
    Number.isInteger(input.birthMonth) &&
    input.birthMonth >= 1 &&
    input.birthMonth <= 12
      ? input.birthMonth
      : null;

  await prisma.onboardingProfile.upsert({
    where: { userId },
    create: {
      userId,
      birthYear: input.birthYear,
      birthMonth,
      gender: input.gender,
      region: input.region.trim(),
    },
    update: {
      birthYear: input.birthYear,
      birthMonth,
      gender: input.gender,
      region: input.region.trim(),
    },
  });

  // 원자적 선점 — skeletonGeneratedAt 이 null 인 행만 골라 지금 시각으로
  // 갱신. count===0 이면 이미 다른 요청이 선점(또는 과거에 완료)한 것이라
  // 골격을 다시 만들지 않는다(중복 생성 방지, 동시 제출에도 안전).
  const claimed = await prisma.onboardingProfile.updateMany({
    where: { userId, skeletonGeneratedAt: null },
    data: { skeletonGeneratedAt: new Date() },
  });
  if (claimed.count === 0) {
    return { status: "ALREADY_DONE" };
  }

  const skeleton = generateSkeleton(input.birthYear, input.gender);
  await prisma.lifeEvent.createMany({
    data: skeleton.map((ev) => ({ userId, ...ev })),
  });

  return { status: "CREATED", count: skeleton.length };
}
