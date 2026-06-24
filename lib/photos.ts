// Phase Photo (2단계) — 사진 DB 헬퍼.
//
// 모든 사진은 UserMemory 1행에 매여있다 (옵션 C 패턴):
//   - 독립 사진: UserMemory(createdVia="photo") 신규 생성 + Photo 1장
//   - life_event 첨부 (3단계+): 기존 life_event 메모리에 Photo 매달기
//
// 정합성 — orphan 방지:
//   - upload(Storage) 가 먼저 (path 확정), 그 후 DB transaction
//   - DB 실패 시 try/catch 로 Storage 롤백
//   - delete: Storage 먼저 (실패면 throw, DB 안 건드림), 성공 시 DB
//
// 권한 — userId 단일 결정자:
//   - 모든 헬퍼가 userId 첫 인자
//   - read/write 시 photo.userId === userId 강제
//   - DB cascade 가 권한 검증을 대신하지 않음 (헬퍼에서 명시)

import { prisma } from "./db";
import {
  CREATED_VIA_LIFE_EVENT,
  isPhotoPeriodAnchor,
  type PhotoPeriodAnchor,
} from "./life-events";
import { EMPTY_PLACE, type PlaceInfo } from "./place-types";
import {
  type AllowedMimeType,
  getSignedUrl,
  removePhoto,
  uploadPhoto,
} from "./storage";

export const CREATED_VIA_PHOTO = "photo";

// 독립 photo 메모리(createdVia="photo")의 data 객체. createIndependentPhoto(신규
// 업로드)와 movePhotoToMemory(사건→독립 빼기)가 공유 — autoTitle·year/month·
// eventYear 미러링·place 컬럼을 한 곳에서. M3 픽스(중복 제거).
function buildPhotoMemoryData(input: {
  userId: string;
  year: number;
  month: number | null;
  caption: string | null; // 이미 trim 됐다고 가정(idempotent)
  place?: PlaceInfo;
}) {
  const trimmed = input.caption?.trim() ? input.caption.trim() : null;
  const monthLabel = input.month ? `${input.month}월 ` : "";
  const autoTitle = `${input.year}년 ${monthLabel}사진`;
  const place = input.place ?? EMPTY_PLACE;
  return {
    userId: input.userId,
    createdVia: CREATED_VIA_PHOTO,
    year: input.year,
    month: input.month,
    title: trimmed ?? autoTitle,
    content: trimmed,
    // getLifeEvents 가 eventYear 기준 where/orderBy — 없으면 타임라인에서 빠짐.
    eventYear: input.year,
    eventMonth: input.month,
    // 장소 5컬럼 (호환 — H6 에서 제거)
    placeName: place.placeName,
    placeAddress: place.placeAddress,
    lat: place.lat,
    lng: place.lng,
    placeSource: place.placeSource,
    // 장소 1:N — 사진은 단일 입력이라 [place] 로 래핑(placeName 있을 때만).
    // 호출부가 validatePlace 로 사전 검증하므로 placeName 가드면 충분.
    ...(place.placeName
      ? {
          places: {
            create: [
              {
                placeName: place.placeName,
                placeAddress: place.placeAddress,
                lat: place.lat,
                lng: place.lng,
                placeSource: place.placeSource,
                sortOrder: 0,
              },
            ],
          },
        }
      : {}),
  };
}

export type CreatePhotoInput = {
  fileBuffer: Buffer;
  mimeType: AllowedMimeType;
  year: number;
  month: number | null;
  caption: string | null;
  // Phase Photo 6 (1단계) — EXIF 촬영시각(또는 file.lastModified 폴백). 컬럼
  // 이미 존재(마이그 0). 타임라인 배치는 year/month, takenAt 은 원본 보존용.
  takenAt?: Date | null;
  // Phase Place (C) — 독립 사진의 장소. 미선택이면 EMPTY_PLACE. photo 메모리도
  // UserMemory 라 place 5컬럼 그대로 저장(마이그 0).
  place?: PlaceInfo;
};

export type CreatePhotoResult = {
  photoId: string;
  memoryId: string;
  storagePath: string;
};

// 독립 사진 1장 + UserMemory 한 행 동시 생성.
// year/month 는 연혁 타임라인 배치용 (3단계). title 은 caption 또는 자동.
export async function createIndependentPhoto(
  userId: string,
  input: CreatePhotoInput,
): Promise<CreatePhotoResult> {
  // 1) Storage 업로드 먼저 — path 확정해야 DB 에 저장 가능
  const uploaded = await uploadPhoto(userId, input.fileBuffer, input.mimeType);

  try {
    // 2) DB transaction — UserMemory + Photo 둘 다 만들거나 둘 다 안 만들거나
    const trimmedCaption = input.caption?.trim() ? input.caption.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const memory = await tx.userMemory.create({
        data: buildPhotoMemoryData({
          userId,
          year: input.year,
          month: input.month,
          caption: trimmedCaption,
          place: input.place,
        }),
        select: { id: true },
      });
      const photo = await tx.photo.create({
        data: {
          userId,
          memoryId: memory.id,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          fileBytes: uploaded.bytes,
          caption: trimmedCaption,
          takenAt: input.takenAt ?? null,
        },
        select: { id: true },
      });
      return { photoId: photo.id, memoryId: memory.id };
    });

    return { ...result, storagePath: uploaded.storagePath };
  } catch (e) {
    // DB 실패 → Storage 롤백 (orphan 파일 안 남게)
    try {
      await removePhoto(uploaded.storagePath);
    } catch (cleanupErr) {
      // 롤백 실패는 서버 로그로만 — 원래 에러를 사용자에게 그대로 전파.
      // 후속 cleanup cron 후보. orphan path 식별 위해 로그에 path 포함.
      console.error("[create-photo-rollback-failed]", {
        path: uploaded.storagePath,
        error: cleanupErr,
      });
    }
    throw e;
  }
}

// Phase Photo (3단계) — 기존 life_event 메모리에 사진 1장 첨부.
//
// 독립 사진(createIndependentPhoto)과 달리 새 UserMemory 를 만들지 않고,
// 이미 있는 life_event 메모리에 Photo 행만 매단다 (1:N 의 N 추가).
//
// 정책 가드 — 첨부 대상은 life_event 만:
//   - era_event(시대 사건 담기): 사용자가 쓴 게 아니라 첨부 불가
//   - photo(독립 사진): 이미 사진 메모리라 또 매달지 않음(독립 업로드로)
//   - 본인 아닌 메모리: 거부
//
// 검증을 Storage 업로드 *전에* 하는 이유: 거부될 요청이 Storage 에 orphan
// 파일을 남기지 않게. 업로드 후 Photo create 가 실패하면 그때 롤백.
export type AttachPhotoInput = {
  fileBuffer: Buffer;
  mimeType: AllowedMimeType;
  caption: string | null;
  // 기간 이벤트에서 어느 점에 띄울지. 생략 시 both(단일 시점·기본).
  periodAnchor?: PhotoPeriodAnchor;
};

export type AttachPhotoResult =
  | { ok: true; photoId: string }
  | { ok: false; reason: "memory_not_found" | "not_life_event" };

export async function attachPhotoToMemory(
  userId: string,
  memoryId: string,
  input: AttachPhotoInput,
): Promise<AttachPhotoResult> {
  // 1) 대상 메모리 검증 (Storage 업로드 전) — 본인 소유 + life_event
  const memory = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true, createdVia: true },
  });
  if (!memory) return { ok: false, reason: "memory_not_found" };
  if (memory.createdVia !== CREATED_VIA_LIFE_EVENT) {
    return { ok: false, reason: "not_life_event" };
  }

  // 2) Storage 업로드 (검증 통과 후)
  const uploaded = await uploadPhoto(userId, input.fileBuffer, input.mimeType);

  // 3) Photo 행 생성 — 실패 시 Storage 롤백 (orphan 방지)
  try {
    const trimmedCaption = input.caption?.trim() ? input.caption.trim() : null;
    const photo = await prisma.photo.create({
      data: {
        userId,
        memoryId,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        fileBytes: uploaded.bytes,
        caption: trimmedCaption,
        periodAnchor: input.periodAnchor ?? "both",
      },
      select: { id: true },
    });
    return { ok: true, photoId: photo.id };
  } catch (e) {
    try {
      await removePhoto(uploaded.storagePath);
    } catch (cleanupErr) {
      console.error("[attach-photo-rollback-failed]", {
        path: uploaded.storagePath,
        error: cleanupErr,
      });
    }
    throw e;
  }
}

// Phase Photo (4단계+) — 첨부 사진의 periodAnchor 재태그(이미 붙은 사진을
// 입학/졸업/전체로 옮김). 권한 = 본인 photo 만(updateMany where userId →
// 일치 없으면 count=0). Storage 무관(메타만 수정).
export async function updatePhotoAnchor(
  userId: string,
  photoId: string,
  anchor: PhotoPeriodAnchor,
): Promise<boolean> {
  const result = await prisma.photo.updateMany({
    where: { id: photoId, userId },
    data: { periodAnchor: anchor },
  });
  return result.count > 0;
}

// Phase Place (C) — 독립 사진 메모리의 장소 수정. 권한 = 본인 photo 메모리만
// (updateMany where {userId, createdVia:"photo"} → 일치 없으면 count=0). 장소는
// UserMemory(메모리)에 있으므로 memoryId 로 수정. 첨부 사진은 부모 life_event
// 장소를 상속하므로 여기 대상 X (createdVia 가드).
export async function updatePhotoMemoryPlaces(
  userId: string,
  memoryId: string,
  places: PlaceInfo[],
): Promise<boolean> {
  // 소유·종류 가드를 트랜잭션 *앞* 에 — MemoryPlace 의 deleteMany/create 는
  // userId 컬럼이 없어(메모리 통해 연결) 자체 가드가 불가. 먼저 본인 photo
  // 메모리인지 확인하고, 아니면 트랜잭션 진입 없이 false (남의 장소 삭제 차단).
  const owned = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId, createdVia: CREATED_VIA_PHOTO },
    select: { id: true },
  });
  if (!owned) return false;

  // placeName 있는 것만 채택. 5컬럼은 첫 장소(primary)로 호환 write.
  const valid = places.filter((p) => p.placeName);
  const primary = valid[0] ?? EMPTY_PLACE;

  // 장소 update = 기존 MemoryPlace 싹 지우고 새로 생성. 메모리 update +
  // 장소 삭제 + 장소 생성을 한 트랜잭션으로 → 원자적(부분 실패 시 전체 롤백).
  await prisma.$transaction([
    prisma.userMemory.update({
      where: { id: memoryId },
      data: {
        // 장소 5컬럼 (호환 — H6 에서 제거)
        placeName: primary.placeName,
        placeAddress: primary.placeAddress,
        lat: primary.lat,
        lng: primary.lng,
        placeSource: primary.placeSource,
      },
    }),
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

// Phase Photo 6 (3단계) — 기존 사진의 소속 메모리 이동(파일 이동 X, memoryId
// 재지정만). 두 방향:
//   - dest {kind:"event", memoryId} : 독립 사진 → life_event 에 첨부(넣기)
//   - dest {kind:"independent"}      : 첨부 사진 → 새 독립 photo 메모리(빼기)
//
// 핵심 — 빼기가 사진을 삭제하지 않는다(어르신 사진 보존). Photo 행은 그대로,
// 부모만 바뀐다. 이동 후 옛 부모가 photo-only 이고 비면 정리(orphan 0).
//
// 정책 — 넣기 대상은 life_event 만(era_event/남의 메모리 거부, attach 와 동일).
export type MovePhotoDest =
  | { kind: "event"; memoryId: string }
  | { kind: "independent" };

export type MovePhotoResult =
  | "moved"
  | "photo_not_found"
  | "dest_not_found"
  | "dest_not_linkable"; // 대상이 life_event 가 아님

export async function movePhotoToMemory(
  userId: string,
  photoId: string,
  dest: MovePhotoDest,
): Promise<MovePhotoResult> {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, userId },
    select: {
      id: true,
      memoryId: true,
      caption: true,
      takenAt: true,
      memory: {
        select: { createdVia: true, year: true, month: true, eventYear: true, eventMonth: true },
      },
    },
  });
  if (!photo) return "photo_not_found";

  const oldMemoryId = photo.memoryId;
  const oldCreatedVia = photo.memory.createdVia;

  // 대상 메모리 결정/검증 (트랜잭션 밖에서 권한 확인)
  if (dest.kind === "event") {
    const target = await prisma.userMemory.findFirst({
      where: { id: dest.memoryId, userId },
      select: { id: true, createdVia: true },
    });
    if (!target) return "dest_not_found";
    if (target.createdVia !== CREATED_VIA_LIFE_EVENT) return "dest_not_linkable";
  }

  await prisma.$transaction(async (tx) => {
    let newMemoryId: string;
    if (dest.kind === "event") {
      newMemoryId = dest.memoryId;
    } else {
      // 독립 복귀 — 새 photo 메모리. 연/월은 takenAt 우선, 없으면 옛 부모 값.
      const year =
        photo.takenAt?.getFullYear() ??
        photo.memory.eventYear ??
        photo.memory.year;
      const month = photo.takenAt
        ? photo.takenAt.getMonth() + 1
        : photo.memory.eventMonth ?? photo.memory.month;
      const newMem = await tx.userMemory.create({
        data: buildPhotoMemoryData({
          userId,
          year,
          month,
          caption: photo.caption,
        }),
        select: { id: true },
      });
      newMemoryId = newMem.id;
    }

    if (newMemoryId !== oldMemoryId) {
      await tx.photo.update({
        where: { id: photo.id },
        data: { memoryId: newMemoryId },
      });
      // 옛 부모가 photo-only 이고 사진 0장이면 정리(orphan 0). life_event 부모는
      // 다른 데이터 보존 위해 그대로 둔다.
      if (oldCreatedVia === CREATED_VIA_PHOTO) {
        const remaining = await tx.photo.count({
          where: { memoryId: oldMemoryId },
        });
        if (remaining === 0) {
          await tx.userMemory.deleteMany({
            where: { id: oldMemoryId, userId, createdVia: CREATED_VIA_PHOTO },
          });
        }
      }
    }
  });

  return "moved";
}

// 사진 1장 삭제. 권한 = 본인 photo 만.
//   - Storage 먼저 (실패 시 throw, DB 무영향)
//   - DB transaction: Photo delete + 마지막 사진이면 photo-only 메모리도 정리
//   - life_event 에 첨부된 사진(3단계+)은 메모리 보존 (다른 데이터 있음)
export type DeletePhotoResult =
  | { deleted: true }
  | { deleted: false; reason: "not_found" };

export async function deletePhotoOwned(
  userId: string,
  photoId: string,
): Promise<DeletePhotoResult> {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, userId },
    select: {
      storagePath: true,
      memoryId: true,
      memory: { select: { createdVia: true } },
    },
  });
  if (!photo) return { deleted: false, reason: "not_found" };

  // Storage 먼저 — 실패하면 DB 안 건드림 (orphan DB row 회피)
  await removePhoto(photo.storagePath);

  await prisma.$transaction(async (tx) => {
    await tx.photo.delete({ where: { id: photoId } });
    // 메모리에 남은 사진 0 + photo-only 메모리이면 메모리도 정리.
    // life_event 첨부면 메모리 보존 (이야기·장소·인물 등 다른 데이터 있음).
    if (photo.memory.createdVia === CREATED_VIA_PHOTO) {
      const remaining = await tx.photo.count({
        where: { memoryId: photo.memoryId },
      });
      if (remaining === 0) {
        // userId + createdVia 강제 — 다른 사용자/다른 createdVia 안 건드림
        await tx.userMemory.deleteMany({
          where: {
            id: photo.memoryId,
            userId,
            createdVia: CREATED_VIA_PHOTO,
          },
        });
      }
    }
  });

  return { deleted: true };
}

// 사용자 사진 목록 + signed URL prefetch (DB 기준). 정렬: 최신 createdAt.
// 페이지네이션은 후속 (현재 limit 200).
export type UserPhoto = {
  id: string;
  storagePath: string;
  signedUrl: string;
  caption: string | null;
  year: number;
  month: number | null;
  bytes: number;
  mimeType: string;
  periodAnchor: PhotoPeriodAnchor;
  // 장소 1:N — 이 사진이 매인 메모리의 장소들(sortOrder 순). 독립 사진
  // (createdVia="photo")은 자기 메모리의 장소, 첨부 사진은 부모 이벤트의
  // 장소. 없으면 빈 배열. (소비처는 H4 UI — 이번엔 읽기만.)
  places: PlaceInfo[];
  createdAt: Date;
};

export async function listUserPhotos(userId: string): Promise<UserPhoto[]> {
  const rows = await prisma.photo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      storagePath: true,
      caption: true,
      fileBytes: true,
      mimeType: true,
      periodAnchor: true,
      createdAt: true,
      memory: {
        select: {
          year: true,
          month: true,
          places: {
            select: {
              placeName: true,
              placeAddress: true,
              lat: true,
              lng: true,
              placeSource: true,
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  // signed URL 병렬 발급 (각 photo 독립)
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      storagePath: r.storagePath,
      signedUrl: await getSignedUrl(r.storagePath),
      caption: r.caption,
      year: r.memory.year,
      month: r.memory.month,
      places: r.memory.places.map((p) => ({
        placeName: p.placeName,
        placeAddress: p.placeAddress,
        lat: p.lat,
        lng: p.lng,
        placeSource: p.placeSource,
      })),
      bytes: r.fileBytes,
      mimeType: r.mimeType,
      periodAnchor: isPhotoPeriodAnchor(r.periodAnchor)
        ? r.periodAnchor
        : ("both" as const),
      createdAt: r.createdAt,
    })),
  );
}

// Phase Photo (4단계) — 한 메모리에 첨부된 사진들 + signed URL. 편집 화면에서
// 그 이벤트의 첨부 사진을 관리(추가/삭제)할 때 사용. where 의 userId 가 소유
// 검증 — 남의 메모리 id 를 넣어도 본인 photo 만 반환(없으면 []). 오래된 순
// (PhotoStrip 표시 순서와 일치).
export async function listMemoryPhotos(
  userId: string,
  memoryId: string,
): Promise<UserPhoto[]> {
  const rows = await prisma.photo.findMany({
    where: { userId, memoryId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      storagePath: true,
      caption: true,
      fileBytes: true,
      mimeType: true,
      periodAnchor: true,
      createdAt: true,
      memory: {
        select: {
          year: true,
          month: true,
          places: {
            select: {
              placeName: true,
              placeAddress: true,
              lat: true,
              lng: true,
              placeSource: true,
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      storagePath: r.storagePath,
      signedUrl: await getSignedUrl(r.storagePath),
      caption: r.caption,
      year: r.memory.year,
      month: r.memory.month,
      places: r.memory.places.map((p) => ({
        placeName: p.placeName,
        placeAddress: p.placeAddress,
        lat: p.lat,
        lng: p.lng,
        placeSource: p.placeSource,
      })),
      bytes: r.fileBytes,
      mimeType: r.mimeType,
      periodAnchor: isPhotoPeriodAnchor(r.periodAnchor)
        ? r.periodAnchor
        : ("both" as const),
      createdAt: r.createdAt,
    })),
  );
}
