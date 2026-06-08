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
      createdAt: r.createdAt,
    })),
  );
}
