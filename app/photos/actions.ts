"use server";

// Phase Place (C) — 독립 사진 메모리의 장소 수정 서버 액션.
// 업로드 시 장소는 POST /api/photos 가 처리하고, 이미 올린 사진의 장소를
// 바꾸는 것만 이 액션이 담당(PhotoCard 의 📍 모달에서 호출).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { validatePlace, type RawPlace } from "@/lib/place-validate";
import { type PlaceInfo } from "@/lib/place-types";
import {
  type MovePhotoResult,
  movePhotoToMemory,
  updatePhotoMemoryPlaces,
} from "@/lib/photos";

export async function updatePhotoPlaceAction(
  memoryId: string,
  rawPlaces: RawPlace[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  // 장소 1:N — 각 항목 검증, 유효한 것만(placeName 있음) 채택.
  const places: PlaceInfo[] = [];
  for (const rp of rawPlaces) {
    const result = validatePlace(rp);
    if (!result.ok) return result;
    if (result.place.placeName) places.push(result.place);
  }

  const ok = await updatePhotoMemoryPlaces(session.user.id, memoryId, places);
  if (!ok) return { ok: false, error: "사진을 찾을 수 없어요." };

  revalidatePath("/life-timeline");
  revalidatePath("/photos");
  return { ok: true };
}

// Phase Photo 6 (3단계) — 독립 사진을 사건(life_event)에 넣기.
export async function movePhotoToEventAction(
  photoId: string,
  targetMemoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = await movePhotoToMemory(session.user.id, photoId, {
    kind: "event",
    memoryId: targetMemoryId,
  });
  if (result !== "moved") return { ok: false, error: moveErrorMsg(result) };

  revalidatePath("/life-timeline");
  revalidatePath("/photos");
  return { ok: true };
}

// Phase Photo 6 (3단계) — 사건에 붙은 사진을 독립 사진으로 빼기(삭제 X).
export async function detachPhotoToIndependentAction(
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = await movePhotoToMemory(session.user.id, photoId, {
    kind: "independent",
  });
  if (result !== "moved") return { ok: false, error: moveErrorMsg(result) };

  revalidatePath("/life-timeline");
  revalidatePath("/photos");
  return { ok: true };
}

function moveErrorMsg(r: MovePhotoResult): string {
  switch (r) {
    case "photo_not_found":
      return "사진을 찾을 수 없어요.";
    case "dest_not_found":
      return "그 사건을 찾을 수 없어요.";
    case "dest_not_linkable":
      return "여기에는 사진을 넣을 수 없어요.";
    default:
      return "옮기지 못했어요.";
  }
}
