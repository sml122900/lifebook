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

// 포스터 노드 연도 표시 전체 토글(포스터 단위 설정). 기본 false=숨김.
export async function setPosterShowYears(
  show: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, showNodeYears: show },
    update: { showNodeYears: show },
  });

  revalidatePath("/poster/view");
  return { ok: true };
}

// 기능2c — 시대 대사건 티어(0=끄기/1/2/3) 설정.
export async function setPosterEraTier(
  tier: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  // 0~3 으로 정규화(잘못된 값 방어).
  const t = Math.max(0, Math.min(3, Math.floor(Number(tier) || 0)));
  await prisma.poster.upsert({
    where: { userId },
    create: { userId, eraTier: t },
    update: { eraTier: t },
  });

  revalidatePath("/poster/view");
  return { ok: true };
}

// 기능2c — 시대 대사건 개별 제거(removedEraEvents 에 id 추가, 멱등).
export async function removePosterEraEvent(
  eraId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;
  if (typeof eraId !== "string" || !eraId) {
    return { ok: false, error: "사건을 찾을 수 없어요." };
  }

  const existing = await prisma.poster.findUnique({
    where: { userId },
    select: { removedEraEvents: true },
  });
  const next = Array.from(new Set([...(existing?.removedEraEvents ?? []), eraId]));
  await prisma.poster.upsert({
    where: { userId },
    create: { userId, removedEraEvents: next },
    update: { removedEraEvents: next },
  });

  revalidatePath("/poster/view");
  return { ok: true };
}
