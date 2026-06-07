// E2 마이그레이션 사전 검증 — UserMemory 에 추가할 partial unique:
//   @@unique([userId, monthEventId, createdVia])  WHERE monthEventId IS NOT NULL
//
// 적용 전 같은 (userId, monthEventId, createdVia) 3쌍이 두 행 이상인지 검사.
// 0 행이어야 안전. 발견되면 어떤 createdVia 가 중복이고 몇 사용자인지 명세.
//
// 실행: npx tsx db/check-era-unique-conflict.ts

import "dotenv/config";
import { prisma } from "../lib/db";

type ConflictRow = {
  userId: string;
  monthEventId: string;
  createdVia: string;
  count: bigint;
};

async function main() {
  // monthEventId 가 NULL 인 행은 partial index 가 영향 X 라 검사에서 제외.
  const conflicts = await prisma.$queryRaw<ConflictRow[]>`
    SELECT "userId", "monthEventId", "createdVia", COUNT(*)::bigint as count
    FROM "UserMemory"
    WHERE "monthEventId" IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;

  // 전체 monthEventId 있는 행 카운트 (대조용).
  const totalWithFk = await prisma.userMemory.count({
    where: { monthEventId: { not: null } },
  });

  // createdVia 별 분포 (어떤 흐름이 monthEventId 를 쓰는지 파악).
  const distribution = await prisma.$queryRaw<
    { createdVia: string; count: bigint }[]
  >`
    SELECT "createdVia", COUNT(*)::bigint as count
    FROM "UserMemory"
    WHERE "monthEventId" IS NOT NULL
    GROUP BY "createdVia"
    ORDER BY count DESC
  `;

  console.log("=== UserMemory @@unique 사전 검증 ===\n");
  console.log(`monthEventId 가 있는 행: 총 ${totalWithFk}건`);
  console.log("createdVia 별 분포:");
  for (const d of distribution) {
    console.log(`  ${d.createdVia}: ${d.count}건`);
  }

  console.log(`\n(userId, monthEventId, createdVia) 3쌍 중복 행: ${conflicts.length} 그룹`);
  if (conflicts.length === 0) {
    console.log("  ✓ 충돌 0 — partial unique 안전하게 적용 가능.");
  } else {
    console.log("  ⚠ 충돌 발견 — 마이그레이션 전 정리 필요:");
    for (const c of conflicts.slice(0, 20)) {
      console.log(`    userId=${c.userId.slice(0, 8)}… monthEventId=${c.monthEventId.slice(0, 8)}… createdVia=${c.createdVia} → ${c.count}건`);
    }
    if (conflicts.length > 20) {
      console.log(`    … 외 ${conflicts.length - 20} 그룹`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
