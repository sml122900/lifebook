"use server";

// P6 — 포스터 수동 편집 저장. /poster/view 편집 모드에서 호출.
//
// 편집기가 *현재 화면의 전체 항목*(삭제분 제외)을 override 포함해 보낸다.
// override 없는 항목은 그대로 자동배치 → 자동/수동 공존(P4 엔진이 분기).
// 저장 본체는 lib/poster/selections.ts(persistPosterOverrides) — 여기선 auth·revalidate 만.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { type PosterSelectionFull } from "@/lib/poster/overrides";
import { persistPosterOverrides } from "@/lib/poster/selections";

export type SaveOverridesResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function savePosterOverrides(
  items: PosterSelectionFull[],
): Promise<SaveOverridesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = await persistPosterOverrides(session.user.id, items);
  if (result.ok) {
    revalidatePath("/poster/view");
    revalidatePath("/poster");
  }
  return result;
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
