// 탈퇴·삭제된 계정의 Storage 고아 파일 정합성 점검 (A안, 2026-10-01).
//
// 대상 = 경로 규칙(lib/storage-purge.ts storageOwnerOf)으로 읽은 소유자 userId 가
// User 에 없는 파일만. 현존 계정의 미참조 파일·규칙 밖 경로는 건드리지 않는다.
// 탈퇴 때 withdrawAccount() 의 Storage 삭제가 실패했거나, A안 이전 탈퇴자의 파일이
// 남은 경우를 치운다.
//
// 기본은 dry-run — 버킷별 개수·용량만 출력한다(파일명·경로·userId 출력 없음).
// --apply 일 때만 삭제. User 가 0명으로 읽히면(잘못된 DB 연결 등 — 모든 파일이
// 고아로 보이는 상황) --apply 를 거부한다.
// 자동화(/api/cron + proxy.ts)는 PG 심사 통과 후 별도 작업(CLAUDE.md 미결).
//
// 실행: npx tsx db/reconcile-storage.ts [--apply]

import "dotenv/config";

import { prisma } from "../lib/db";
import { removeStorageObjects } from "../lib/storage";
import { storageOwnerOf } from "../lib/storage-purge";

type Obj = { bucket_id: string; name: string; size: bigint | null };

async function main() {
  const apply = process.argv.includes("--apply");

  const [objects, users] = await Promise.all([
    prisma.$queryRaw<Obj[]>`
      SELECT bucket_id, name, (metadata->>'size')::bigint AS size FROM storage.objects`,
    prisma.user.findMany({ select: { id: true } }),
  ]);
  const userIds = new Set(users.map((u) => u.id));

  const perBucket = new Map<
    string,
    {
      total: number;
      orphanPaths: string[];
      orphanBytes: number;
      owners: Set<string>;
      unknown: number;
    }
  >();
  for (const o of objects) {
    const b = perBucket.get(o.bucket_id) ?? {
      total: 0,
      orphanPaths: [],
      orphanBytes: 0,
      owners: new Set<string>(),
      unknown: 0,
    };
    perBucket.set(o.bucket_id, b);
    b.total += 1;
    const owner = storageOwnerOf(o.bucket_id, o.name);
    if (owner === null) {
      b.unknown += 1;
      continue;
    }
    if (!userIds.has(owner)) {
      b.orphanPaths.push(o.name);
      b.orphanBytes += Number(o.size ?? 0);
      b.owners.add(owner);
    }
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(
    `모드: ${apply ? "APPLY(삭제)" : "dry-run(삭제 안 함)"} · User ${userIds.size}명`,
  );
  let orphanTotal = 0;
  for (const [bucket, b] of perBucket) {
    orphanTotal += b.orphanPaths.length;
    console.log(
      `${bucket}: 전체 ${b.total}개 | 고아(소유자 계정 없음) ${b.orphanPaths.length}개 ${mb(b.orphanBytes)} · 계정 ${b.owners.size}명분 | 규칙 밖 경로 ${b.unknown}개(대상 아님)`,
    );
  }

  if (!apply) {
    console.log(
      orphanTotal === 0
        ? "고아 파일 없음."
        : "삭제하려면 --apply 로 다시 실행.",
    );
    return;
  }
  if (userIds.size === 0) {
    throw new Error("User 가 0명으로 읽혀 --apply 중단(DB 연결 확인).");
  }
  let removed = 0;
  for (const [bucket, b] of perBucket) {
    if (b.orphanPaths.length === 0) continue;
    if (bucket !== "photos" && bucket !== "recordings") continue;
    await removeStorageObjects(bucket, b.orphanPaths);
    removed += b.orphanPaths.length;
  }
  console.log(`삭제 완료: ${removed}개`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
