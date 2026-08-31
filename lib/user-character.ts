// 사용자 대화 캐릭터 선택 읽기/쓰기 (서버, prisma). lib/user-ai-model.ts 와
// 동일 패턴. 값이 비정상이거나 없으면 DEFAULT_CHARACTER_ID 폴백.

import { cache } from "react";

import { prisma } from "@/lib/db";
import { DEFAULT_CHARACTER_ID, isCharacterId } from "@/lib/characters";

export type UserCharacterPrefs = {
  characterId: string;
  motionEnabled: boolean;
};

async function _getUserCharacterPrefs(userId: string): Promise<UserCharacterPrefs> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { characterId: true, characterMotionEnabled: true },
  });
  return {
    characterId: isCharacterId(u?.characterId) ? u.characterId : DEFAULT_CHARACTER_ID,
    motionEnabled: u?.characterMotionEnabled ?? true,
  };
}
// request 단위 메모(같은 요청서 여러 호출부가 읽어도 1쿼리).
export const getUserCharacterPrefs = cache(_getUserCharacterPrefs);

export async function setUserCharacter(userId: string, characterId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { characterId },
  });
}

export async function setUserCharacterMotionEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { characterMotionEnabled: enabled },
  });
}
