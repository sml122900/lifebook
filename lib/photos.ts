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
import {
  type AllowedMimeType,
  getSignedUrl,
  removePhoto,
  uploadPhoto,
} from "./storage";

export const CREATED_VIA_PHOTO = "photo";

export type CreatePhotoInput = {
  fileBuffer: Buffer;
  mimeType: AllowedMimeType;
  year: number;
  month: number | null;
  caption: string | null;
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
    const monthLabel = input.month ? `${input.month}월 ` : "";
    const autoTitle = `${input.year}년 ${monthLabel}사진`;

    const result = await prisma.$transaction(async (tx) => {
      const memory = await tx.userMemory.create({
        data: {
          userId,
          createdVia: CREATED_VIA_PHOTO,
          year: input.year,
          month: input.month,
          title: trimmedCaption ?? autoTitle,
          content: trimmedCaption,
          // Phase Photo (3단계) — eventYear/eventMonth 미러링. getLifeEvents 가
          // eventYear 기준으로 where/orderBy 하므로, 이게 없으면 사진이 연혁
          // 타임라인에서 통째로 빠진다. year/month 와 동일 값.
          eventYear: input.year,
          eventMonth: input.month,
        },
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
      memory: { select: { year: true, month: true } },
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
      memory: { select: { year: true, month: true } },
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
      bytes: r.fileBytes,
      mimeType: r.mimeType,
      periodAnchor: isPhotoPeriodAnchor(r.periodAnchor)
        ? r.periodAnchor
        : ("both" as const),
      createdAt: r.createdAt,
    })),
  );
}
