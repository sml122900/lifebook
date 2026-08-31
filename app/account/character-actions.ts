"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCharacterId } from "@/lib/characters";
import { setUserCharacter, setUserCharacterMotionEnabled } from "@/lib/user-character";

// 캐릭터 선택 갱신 — 설정 페이지 전용(ai-model-actions.ts 와 동일 패턴).
export async function updateCharacter(
  characterId: string,
): Promise<{ ok: boolean; characterId?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  if (!isCharacterId(characterId)) return { ok: false };
  await setUserCharacter(session.user.id, characterId);
  revalidatePath("/account/settings");
  revalidatePath("/chat-v3");
  return { ok: true, characterId };
}

export async function updateCharacterMotion(
  enabled: boolean,
): Promise<{ ok: boolean; enabled?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  await setUserCharacterMotionEnabled(session.user.id, enabled);
  revalidatePath("/account/settings");
  revalidatePath("/chat-v3");
  return { ok: true, enabled };
}
