"use server";

// Phase Place (C) — 독립 사진 메모리의 장소 수정 서버 액션.
// 업로드 시 장소는 POST /api/photos 가 처리하고, 이미 올린 사진의 장소를
// 바꾸는 것만 이 액션이 담당(PhotoCard 의 📍 모달에서 호출).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { validatePlace, type RawPlace } from "@/lib/place-validate";
import { updatePhotoMemoryPlace } from "@/lib/photos";

export async function updatePhotoPlaceAction(
  memoryId: string,
  rawPlace: RawPlace,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = validatePlace(rawPlace);
  if (!result.ok) return result;

  const ok = await updatePhotoMemoryPlace(
    session.user.id,
    memoryId,
    result.place,
  );
  if (!ok) return { ok: false, error: "사진을 찾을 수 없어요." };

  revalidatePath("/life-timeline");
  revalidatePath("/photos");
  return { ok: true };
}
