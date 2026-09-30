// 회원 탈퇴 시 Storage 파일 삭제(A안, 2026-10-01) + 정합성 점검(db/reconcile-storage.ts) 공용 로직.
//
// 사용자 폴더 3곳만 대상 — 끝 슬래시까지 포함한 정확한 prefix:
//   photos/{userId}/            사진
//   photos/poster-bg/{userId}/  포스터 맞춤배경(확정 전 미리보기 포함)
//   recordings/{userId}/        녹음(항목 녹음 + 동반자·통녹음 rec_)
// 파일 찾기는 storage.objects 를 SQL starts_with 로 한다 — Storage list API 는 이름
// 접두어 검색(ILIKE)이라 "abc" 가 "abc2/" 폴더까지 걸리거나 id 의 "_" 가 와일드카드로
// 동작할 수 있어 쓰지 않는다. 삭제는 Storage API remove(정확한 경로 목록) — SQL 로
// storage.objects 행만 지우면 실제 파일이 남는다.

import { prisma } from "./db";
import { removeStorageObjects } from "./storage";

export type StorageBucket = "photos" | "recordings";

export function userStorageFolders(
  userId: string,
): { bucket: StorageBucket; prefix: string }[] {
  // 빈 id·"/" 포함 id 는 다른 사용자 폴더를 가리킬 수 있어 거부.
  if (!userId || userId.includes("/")) throw new Error("잘못된 userId");
  return [
    { bucket: "photos", prefix: `${userId}/` },
    { bucket: "photos", prefix: `poster-bg/${userId}/` },
    { bucket: "recordings", prefix: `${userId}/` },
  ];
}

// 경로 → 소유자 userId(정합성 점검용). 위 3가지 규칙 밖의 경로는 null — 삭제 대상 아님.
export function storageOwnerOf(bucket: string, name: string): string | null {
  const seg = name.split("/");
  if (bucket === "photos" && seg[0] === "poster-bg") {
    return seg.length >= 3 && seg[1] ? seg[1] : null;
  }
  if (bucket === "photos" || bucket === "recordings") {
    return seg.length >= 2 && seg[0] ? seg[0] : null;
  }
  return null;
}

export async function listUserStorageObjects(
  userId: string,
): Promise<{ bucket: StorageBucket; name: string }[]> {
  const found: { bucket: StorageBucket; name: string }[] = [];
  for (const f of userStorageFolders(userId)) {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM storage.objects
      WHERE bucket_id = ${f.bucket} AND starts_with(name, ${f.prefix})`;
    for (const r of rows) found.push({ bucket: f.bucket, name: r.name });
  }
  return found;
}

// 사용자 폴더 3곳의 파일을 모두 지우고 지운 개수를 돌려준다.
export async function purgeUserStorage(userId: string): Promise<number> {
  const objects = await listUserStorageObjects(userId);
  for (const bucket of ["photos", "recordings"] as const) {
    const paths = objects.filter((o) => o.bucket === bucket).map((o) => o.name);
    if (paths.length > 0) await removeStorageObjects(bucket, paths);
  }
  return objects.length;
}
