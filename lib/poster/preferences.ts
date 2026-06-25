// P5-5a — 맞춤배경 취향(preferences) 저장·병합 (서버).
//
// 두 출처를 분리 저장한다:
//   - extractedPreferences: AI 추출분(S6 SplitResult.preferences). 대화/통녹음에서
//     나올 때 addExtractedPreferences 로 누적(union·중복제거·상한).
//   - userPreferences: 사용자 직접 입력. ★ 병합 시 우세(앞·강조 위치).
// getPreferencesForBackground 가 사용자 우선으로 병합 → buildBackgroundPrompt 입력.

import { prisma } from "@/lib/db";

const PREF_MAX_LEN = 100; // 한 항목 최대 길이
const EXTRACTED_CAP = 20; // 추출분 누적 상한(오래된 것 버림)
const USER_CAP = 15; // 사용자 입력 상한
const MERGE_CAP = 12; // 병합 결과 상한(buildBackgroundPrompt 가 다시 10 으로 slice)

function clean(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, PREF_MAX_LEN);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// 추출분 누적 — 새 항목을 앞에(최근 강조) union·중복제거·상한.
export async function addExtractedPreferences(
  userId: string,
  prefs: string[],
): Promise<void> {
  const incoming = clean(prefs);
  if (incoming.length === 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { extractedPreferences: true },
  });
  if (!user) return;

  const merged = clean([...incoming, ...user.extractedPreferences]).slice(0, EXTRACTED_CAP);
  await prisma.user.update({
    where: { id: userId },
    data: { extractedPreferences: merged },
  });
}

// 사용자 직접 입력 저장(교체). 빈 항목 정리·상한.
export async function setUserPreferences(
  userId: string,
  prefs: string[],
): Promise<string[]> {
  const cleaned = clean(prefs).slice(0, USER_CAP);
  await prisma.user.update({
    where: { id: userId },
    data: { userPreferences: cleaned },
  });
  return cleaned;
}

// UI 표시·편집용 — 출처별 그대로.
export async function getPreferences(
  userId: string,
): Promise<{ user: string[]; extracted: string[] }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { userPreferences: true, extractedPreferences: true },
  });
  return {
    user: clean(u?.userPreferences ?? []),
    extracted: clean(u?.extractedPreferences ?? []),
  };
}

// ★ 병합 — buildBackgroundPrompt 입력용. 사용자 입력 우선(앞·강조), 추출 보조(뒤).
// 사용자 입력만 있어도, 추출만 있어도, 둘 다 없어도(빈 배열 → P5-1 중립) 동작.
export async function getPreferencesForBackground(
  userId: string,
): Promise<string[]> {
  const { user, extracted } = await getPreferences(userId);
  // 사용자 입력을 앞에 두면 buildBackgroundPrompt 의 10-cap 에서 사용자분이 우세.
  return clean([...user, ...extracted]).slice(0, MERGE_CAP);
}
