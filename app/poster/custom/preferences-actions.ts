"use server";

// P5-5a — 맞춤배경 취향 사용자 입력 CRUD.
// 추출분은 대화/통녹음에서 자동 누적(addExtractedPreferences). 여기선 사용자가
// 직접 입력·수정하는 userPreferences 만 다룬다(병합 시 우세).

import { auth } from "@/auth";
import { getPreferences, setUserPreferences } from "@/lib/poster/preferences";

export async function loadPreferences(): Promise<
  { ok: true; user: string[]; extracted: string[] } | { ok: false }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  const p = await getPreferences(session.user.id);
  return { ok: true, user: p.user, extracted: p.extracted };
}

export async function saveUserPreferences(
  prefs: string[],
): Promise<{ ok: true; saved: string[] } | { ok: false }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  if (!Array.isArray(prefs)) return { ok: false };
  const saved = await setUserPreferences(session.user.id, prefs);
  return { ok: true, saved };
}
