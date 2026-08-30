"use server";

// v3 통합 채팅 온보딩 — 신상 파싱 + 재진입 분기 전용 액션.
//
// 골격 생성(completeOnboarding)·확인질문(getNextConfirmQuestion/
// submitConfirmAnswer)은 기존 액션을 그대로 재사용한다(여기서 재정의 X).
// 이 파일은 v3 채팅이 신상정보(생년/출생지)를 자유 발화로 받을 때만 필요한
// 두 가지 — 파싱과 "OnboardingProfile 있음/없음" 재진입 판단 — 을 담당한다.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import {
  PROFILE_BIRTH_YEAR_PARSE_SYSTEM_PROMPT,
  PROFILE_REGION_PARSE_SYSTEM_PROMPT,
} from "@/lib/prompts/onboarding-profile-chat";

// 추출/분류는 항상 Sonnet 고정 — life-event-confirm.ts 와 같은 이유(전역
// aiModel 라이브 응답과 무관).
const PARSE_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";

const MIN_BIRTH_YEAR = 1920;
const MAX_BIRTH_YEAR = 2015;

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

// 재진입 분기 — OnboardingProfile 존재 여부만으로 "신상부터" vs "확인질문
// 이어서"를 가른다. 골격 유무는 completeOnboarding 이 항상 profile 생성과
// 함께 원자적으로 만들므로 profile 존재 = 골격 존재로 취급해도 안전하다.
export async function hasOnboardingProfile(userId: string): Promise<boolean> {
  await requireUserId(userId);
  const profile = await prisma.onboardingProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile !== null;
}

export type ParseBirthYearResult = { birthYear: number } | { birthYear: null };

export async function parseProfileBirthYear(
  text: string,
): Promise<ParseBirthYearResult> {
  await auth().then((s) => {
    if (!s?.user?.id) throw new Error("Unauthorized");
  });

  try {
    const res = await chat(
      [{ role: "user", content: text }],
      { system: PROFILE_BIRTH_YEAR_PARSE_SYSTEM_PROMPT, model: PARSE_MODEL, maxTokens: 200 },
    );
    const parsed = JSON.parse(stripJsonFence(res.text)) as { birthYear?: unknown };
    const year = parsed.birthYear;
    if (
      typeof year === "number" &&
      Number.isInteger(year) &&
      year >= MIN_BIRTH_YEAR &&
      year <= MAX_BIRTH_YEAR
    ) {
      return { birthYear: year };
    }
  } catch {
    // 파싱 실패 → UNCLEAR 취급, 재질문.
  }
  return { birthYear: null };
}

export type ParseRegionResult = { region: string } | { region: null };

export async function parseProfileRegion(text: string): Promise<ParseRegionResult> {
  await auth().then((s) => {
    if (!s?.user?.id) throw new Error("Unauthorized");
  });

  try {
    const res = await chat(
      [{ role: "user", content: text }],
      { system: PROFILE_REGION_PARSE_SYSTEM_PROMPT, model: PARSE_MODEL, maxTokens: 200 },
    );
    const parsed = JSON.parse(stripJsonFence(res.text)) as { region?: unknown };
    if (typeof parsed.region === "string" && parsed.region.trim()) {
      return { region: parsed.region.trim() };
    }
  } catch {
    // 파싱 실패 → UNCLEAR 취급, 재질문.
  }
  return { region: null };
}
