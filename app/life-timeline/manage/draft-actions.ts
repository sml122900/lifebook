"use server";

// 동반자 추출 초안 승인/거절 액션.
//
// isDraft=true 행만 조작. updateMany/deleteMany + userId 가드로 타인 조작 불가.

import { revalidatePath } from "next/cache";

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
