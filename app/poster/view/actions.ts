"use server";

// P6 — 포스터 수동 편집 저장. /poster/view 편집 모드에서 호출.
//
// 편집기가 *현재 화면의 전체 항목*(삭제분 제외)을 override 포함해 보낸다.
// 소유·존재 검증 후 Poster.selections 를 통째로 교체(삭제 = 빠진 항목).
// override 없는 항목은 그대로 자동배치 → 자동/수동 공존(P4 엔진이 분기).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  sanitizeOverride,
  type PosterSelectionFull,
} from "@/lib/poster/overrides";

export type SaveOverridesResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function savePosterOverrides(
  items: PosterSelectionFull[],
): Promise<SaveOverridesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  // 소유·존재 검증 — 본인 life_event id 만 허용(select 와 동일 가드).
  const owned = await prisma.userMemory.findMany({
    where: { userId, createdVia: "life_event", eventYear: { not: null } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  const clean: PosterSelectionFull[] = [];
  for (const s of items) {
    if (!s || typeof s.eventId !== "string") continue;
    if (!ownedIds.has(s.eventId)) continue;
    if (s.type !== "node" && s.type !== "memo") continue;
    clean.push({
      eventId: s.eventId,
      type: s.type,
      order: typeof s.order === "number" ? s.order : 0,
      override: sanitizeOverride(s.override),
    });
  }

  // order 조밀화(0..n) — 화면 순서 보존.
  clean.sort((a, b) => a.order - b.order);
  clean.forEach((s, i) => (s.order = i));

  // override 없는 항목은 필드 자체를 빼서 JSON 가볍게.
  const toStore = clean.map((s) =>
    s.override
      ? { eventId: s.eventId, type: s.type, order: s.order, override: s.override }
      : { eventId: s.eventId, type: s.type, order: s.order },
  );

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, selections: toStore },
    update: { selections: toStore },
  });

  revalidatePath("/poster/view");
  revalidatePath("/poster");
  return { ok: true, count: toStore.length };
}
