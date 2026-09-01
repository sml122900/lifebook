// STAGE4 — Episode ↔ UserMemory 브릿지(방식 A).
//
// Episode 저장 시 UserMemory 를 하나 함께 만들어 memoryId 로 연결한다.
// 이 UserMemory 를 통해 기존 사진(EventPhotos)·장소(PlacesEditor) 컴포넌트를
// 그대로 재사용할 수 있다(둘 다 memoryId 기반).
//
// createdVia="episode" 는 lib/life-events.ts 의 getLifeEvents 화이트리스트
// (life_event/era_event/photo) 밖이라 /life-timeline 에는 노출되지 않는다.
// ⚠️ listRoomMemories(가족 룸)는 "photo" 만 제외하므로 이 태그는 노출될 수
// 있음 — 온보딩 파이프라인이 아직 /enter 에 연결 전이라 지금은 영향 없음
// (연결 시 재검토 필요, 이번 범위 아님).

import { prisma } from "./db";
import type { PlaceInfo } from "./place-types";

export const CREATED_VIA_EPISODE = "episode";

// UserMemory.year 는 NOT NULL. FIRST_JOB/MARRIAGE 처럼 STAGE2 에서 연도가
// 끝내 안 채워진 이벤트는 실제 연도를 알 수 없다 — 이 필드는 현재
// createdVia="episode" 행에 대해 어디서도 표시/정렬에 쓰이지 않으므로,
// 현재 연도를 의미 없는 placeholder 로 채운다(실데이터 아님).
function resolveMemoryYear(year: number | null): number {
  return year ?? new Date().getFullYear();
}

// v3 P6 — personId(optional) 는 이 에피소드가 특정 인물과의 이야기일 때만
// 넘긴다(일반 사건 회고는 undefined). 소유 검증은 호출자(app/actions/
// person-chat.ts)가 PersonLifeEvent 로 이미 했으므로 여기서 다시 안 함 —
// createEpisodeBridge 자체가 lifeEventId 소유만 검증하는 기존 계약 유지.
export async function createEpisodeBridge(
  userId: string,
  lifeEventId: string,
  label: string,
  year: number | null,
  content: string,
  rawTranscript: string,
  personId?: string,
): Promise<{ episodeId: string; memoryId: string } | null> {
  // 2026-09-01 — CORRECTED 도 허용(app/actions/episode.ts requireConfirmedEvent
  // 와 같은 이유). 저 함수가 이미 CORRECTED 이벤트를 통과시키는데 여기서 다시
  // CONFIRMED 만 보면 finishEpisodeChat 저장이 "이야기를 찾을 수 없어요" 로 깨진다.
  const event = await prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true },
  });
  if (!event) return null;

  return prisma.$transaction(async (tx) => {
    const memory = await tx.userMemory.create({
      data: {
        userId,
        year: resolveMemoryYear(year),
        title: label,
        content,
        createdVia: CREATED_VIA_EPISODE,
      },
      select: { id: true },
    });
    const episode = await tx.episode.create({
      data: {
        lifeEventId,
        memoryId: memory.id,
        content,
        rawTranscript,
        personId: personId ?? null,
      },
      select: { id: true },
    });
    await tx.lifeEvent.update({
      where: { id: lifeEventId },
      data: { hasEpisode: true },
    });
    return { episodeId: episode.id, memoryId: memory.id };
  });
}

// PlacesEditor(장소 1:N) 저장 — updatePhotoMemoryPlaces(lib/photos.ts) 와
// 같은 패턴(소유·종류 가드 → 트랜잭션으로 싹 지우고 새로 생성), 대상
// createdVia 만 "episode" 로 다르다.
export async function saveEpisodePlaces(
  userId: string,
  memoryId: string,
  places: PlaceInfo[],
): Promise<boolean> {
  const owned = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId, createdVia: CREATED_VIA_EPISODE },
    select: { id: true },
  });
  if (!owned) return false;

  const valid = places.filter((p) => p.placeName);

  await prisma.$transaction([
    prisma.memoryPlace.deleteMany({ where: { memoryId } }),
    ...(valid.length
      ? [
          prisma.memoryPlace.createMany({
            data: valid.map((p, i) => ({
              memoryId,
              placeName: p.placeName as string,
              placeAddress: p.placeAddress,
              lat: p.lat,
              lng: p.lng,
              placeSource: p.placeSource,
              sortOrder: i,
            })),
          }),
        ]
      : []),
  ]);
  return true;
}
