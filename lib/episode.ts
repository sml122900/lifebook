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
import { isSubstantiveEpisodeContent } from "./episode-text";
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
//
// P9-1 — isPeriod(optional, 기본 false) 는 이 이야기가 앵커 이벤트 "자체"가
// 아니라 그 이벤트 "이후" 구간(time_gap 갭에서 시작) 이야기였는지. 한
// LifeEvent 에 이벤트-자체 Episode 와 period Episode 가 여러 건 함께 붙을
// 수 있다(unique 제약 없음 — 의도된 설계, gap-detector 가 isPeriod 로 해소
// 여부만 판단).
export async function createEpisodeBridge(
  userId: string,
  lifeEventId: string,
  label: string,
  year: number | null,
  content: string,
  rawTranscript: string,
  personId?: string,
  isPeriod?: boolean,
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
        isPeriod: isPeriod ?? false,
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

// v3 P19-1 — Episode 삭제. Episode 는 자기 lifeEventId/memoryId 둘 다 FK를
// 갖지만 cascade 방향은 "memory→episode"·"lifeEvent→episode" 뿐이라
// (역방향 없음), Episode 만 지우면 UserMemory 브릿지 행이 고아로 남는다.
// UserMemory 를 지워서 Episode 를 cascade 시키는 게 유일하게 안전한 순서
// (db/test-people.ts 의 `userMemory.delete({ id: trip.id })` 와 동일 패턴).
export type DeleteEpisodeResult = { ok: true } | { ok: false; error: string };

export async function deleteEpisode(
  userId: string,
  episodeId: string,
): Promise<DeleteEpisodeResult> {
  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, memory: { userId } },
    select: { id: true, memoryId: true, lifeEventId: true },
  });
  if (!episode) return { ok: false, error: "이야기를 찾을 수 없어요." };

  await prisma.$transaction(async (tx) => {
    // Comment/MemoryReaction 은 UserMemory 를 폴리모픽(targetType/targetId)
    // 으로 가리켜 FK cascade 가 안 된다(lib/account-deletion.ts 와 동일
    // 이유) — 미리 지워야 고아 댓글/반응이 안 남는다.
    await tx.comment.deleteMany({
      where: { targetType: "user_memory", targetId: episode.memoryId },
    });
    await tx.memoryReaction.deleteMany({
      where: { targetType: "user_memory", targetId: episode.memoryId },
    });
    await tx.userMemory.delete({ where: { id: episode.memoryId } });

    // P16-1 이 hasEpisode 대신 "실질 내용 있는 Episode 존재"로 갭을
    // 판단하지만, 배지 표시용 hasEpisode 플래그도 정합을 맞춘다(핸드오프
    // 명시 요구) — 남은 Episode 중 실질 내용이 하나라도 있으면 유지.
    const remaining = await tx.episode.findMany({
      where: { lifeEventId: episode.lifeEventId },
      select: { content: true },
    });
    const stillHasEpisode = remaining.some((e) => isSubstantiveEpisodeContent(e.content));
    await tx.lifeEvent.update({
      where: { id: episode.lifeEventId },
      data: { hasEpisode: stillHasEpisode },
    });
  });

  return { ok: true };
}

// v3 P19-3 — Episode 본문 정정. rawTranscript(원본 대화 로그)는 그대로 두고
// content(요약본)만 갱신 — /people 인물 상세(listEventsByPerson) 도 이
// content 를 그대로 읽으므로 별도 반영 코드 없이 자동으로 맞는다.
// UserMemory.content 도 함께 갱신 — createEpisodeBridge 가 애초에 두 값을
// 같은 텍스트로 채워 저장하므로(브릿지 행이 나중에 가족 룸 등 다른 화면에
// 노출될 가능성 대비) 어긋나지 않게 유지한다.
export type UpdateEpisodeContentResult = { ok: true } | { ok: false; error: string };

export async function updateEpisodeContent(
  userId: string,
  episodeId: string,
  content: string,
): Promise<UpdateEpisodeContentResult> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "내용을 입력해 주세요." };

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, memory: { userId } },
    select: { id: true, memoryId: true },
  });
  if (!episode) return { ok: false, error: "이야기를 찾을 수 없어요." };

  await prisma.$transaction([
    prisma.episode.update({ where: { id: episode.id }, data: { content: trimmed } }),
    prisma.userMemory.update({ where: { id: episode.memoryId }, data: { content: trimmed } }),
  ]);

  return { ok: true };
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
