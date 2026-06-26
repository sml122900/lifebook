"use server";

// 동반자 추출 초안 승인/거절 액션.
//
// isDraft=true 행만 조작. updateMany/deleteMany + userId 가드로 타인 조작 불가.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

function revalidateAll() {
  revalidatePath("/life-timeline/manage");
  revalidatePath("/life-timeline");
  revalidatePath("/people");
}

// 사건 승인 → isDraft=false (타임라인에 즉시 노출)
export async function approveDraftMemoryAction(memoryId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.userMemory.updateMany({
    where: { id: memoryId, userId: session.user.id, isDraft: true },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 사건 거절 → 삭제
export async function rejectDraftMemoryAction(memoryId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.userMemory.deleteMany({
    where: { id: memoryId, userId: session.user.id, isDraft: true },
  });
  revalidateAll();
}

// 사건 draft "수정" → isDraft=false 확정 후 기존 편집 화면으로.
// 초안은 이미 DB 에 있으므로 "수정"은 곧 "추가하면서 바로 편집하러 가기"다.
// 편집 화면(getLifeEventById)은 eventYear/category 가 null 이면 404 → 보강한다.
// (추출 초안은 둘 다 null 일 수 있음: 연도 못 잡았으면 year 미러로, 분류 못 잡았으면 FAMILY.)
export async function editDraftMemoryAction(memoryId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const row = await prisma.userMemory.findFirst({
    where: {
      id: memoryId,
      userId: session.user.id,
      isDraft: true,
      createdVia: "life_event",
    },
    select: { eventYear: true, year: true, category: true },
  });
  if (!row) return; // 없거나 이미 처리됨 → /manage 로 그대로 복귀
  await prisma.userMemory.updateMany({
    where: { id: memoryId, userId: session.user.id, isDraft: true },
    data: {
      isDraft: false,
      ...(row.eventYear === null ? { eventYear: row.year } : {}),
      ...(row.category === null ? { category: "FAMILY" } : {}),
    },
  });
  revalidateAll();
  // redirect 는 NEXT_REDIRECT 를 던지므로 항상 마지막에.
  redirect(`/life-timeline/${memoryId}/edit`);
}

// 인물 draft "수정" → isDraft=false 확정 후 인물 편집 화면으로.
// getPerson 이 isDraft=false 만 통과 → 확정해야 편집 화면이 로드된다.
export async function editDraftPersonAction(personId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const { count } = await prisma.person.updateMany({
    where: { id: personId, userId: session.user.id, isDraft: true },
    data: { isDraft: false },
  });
  if (count === 0) return; // 없거나 이미 처리됨
  revalidateAll();
  redirect(`/people/${personId}/edit`);
}

// 인물 승인 → isDraft=false
export async function approveDraftPersonAction(personId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.updateMany({
    where: { id: personId, userId: session.user.id, isDraft: true },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 인물 거절 → 삭제
export async function rejectDraftPersonAction(personId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.deleteMany({
    where: { id: personId, userId: session.user.id, isDraft: true },
  });
  revalidateAll();
}

// 세션 전체 사건 승인
export async function approveAllSessionMemoriesAction(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.userMemory.updateMany({
    where: { companionSessionId: sessionId, userId: session.user.id, isDraft: true },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 세션 전체 인물 승인 (subjectType="person" 만)
export async function approveAllSessionPeopleAction(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.updateMany({
    where: { companionSessionId: sessionId, userId: session.user.id, isDraft: true, subjectType: "person" },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 세션 전체 장소 승인
export async function approveAllSessionLocationsAction(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.updateMany({
    where: { companionSessionId: sessionId, userId: session.user.id, isDraft: true, subjectType: "location" },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 세션 전체 물건 승인
export async function approveAllSessionThingsAction(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.updateMany({
    where: { companionSessionId: sessionId, userId: session.user.id, isDraft: true, subjectType: "thing" },
    data: { isDraft: false },
  });
  revalidateAll();
}

// 장소 승인 + 좌표 저장 (PlaceSearchInput 결과 포함)
export async function approveLocationWithPlaceAction(
  personId: string,
  place: { lat: number; lng: number; placeAddress: string | null; placeSource: string },
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.person.updateMany({
    where: { id: personId, userId: session.user.id, isDraft: true, subjectType: "location" },
    data: {
      isDraft: false,
      lat: place.lat,
      lng: place.lng,
      placeAddress: place.placeAddress,
      placeSource: place.placeSource,
    },
  });
  revalidateAll();
}
