// MonthEvent 중복 정리 — diagnose-monthevent-dupes.ts 의 결정 규칙을
// 그대로 실행해 옛 cuid 행을 삭제한다.
//
// 안전장치:
//   - 트랜잭션 안에서 (a) 추억 연결 재확인 → 있으면 그룹 skip
//   - 둘 다 추억 0 일 때만 deterministic 보존, 옛 cuid 삭제
//   - 한 그룹의 모든 행이 옛 cuid 거나 모두 deterministic 면 그대로 skip
//     (자동 판단 불가)

import "dotenv/config";
import { prisma } from "../lib/db";

type GroupRow = {
  year: number | null;
  month: number | null;
  section: string;
  title: string;
  cnt: number;
};

function isDeterministicId(id: string): boolean {
  return /^[0-9a-f]{24}$/.test(id);
}

async function main() {
  const groups = await prisma.$queryRaw<GroupRow[]>`
    SELECT "year", "month", "section"::text AS section, "title", COUNT(*)::int AS cnt
    FROM "MonthEvent"
    GROUP BY "year", "month", "section", "title"
    HAVING COUNT(*) > 1
    ORDER BY "year" NULLS FIRST, "month" NULLS FIRST, "section", "title"
  `;

  console.log(`중복 그룹: ${groups.length}개`);

  let deleted = 0;
  let skippedByMemory = 0;
  let skippedAmbiguous = 0;

  for (const g of groups) {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "MonthEvent"
        WHERE COALESCE("year", -1) = COALESCE(${g.year}, -1)
          AND COALESCE("month", -1) = COALESCE(${g.month}, -1)
          AND "section"::text = ${g.section}
          AND "title" = ${g.title}
      `;
      const ids = rows.map((r) => r.id);

      // 트랜잭션 안에서 한 번 더 추억 연결 재확인.
      const linked = await tx.userMemory.findMany({
        where: { monthEventId: { in: ids } },
        select: { id: true, monthEventId: true },
      });
      const linkedSet = new Set(linked.map((m) => m.monthEventId));

      if (linkedSet.size > 1) {
        return { kind: "skipped_memory" as const, deleted: 0 };
      }

      let keeperId: string;
      if (linkedSet.size === 1) {
        keeperId = [...linkedSet][0]!;
      } else {
        const det = ids.find(isDeterministicId);
        if (!det) {
          return { kind: "skipped_ambiguous" as const, deleted: 0 };
        }
        keeperId = det;
      }

      const dropIds = ids.filter((id) => id !== keeperId);
      if (dropIds.length === 0) {
        return { kind: "skipped_ambiguous" as const, deleted: 0 };
      }

      const del = await tx.monthEvent.deleteMany({
        where: { id: { in: dropIds } },
      });
      return { kind: "deleted" as const, deleted: del.count };
    });

    if (result.kind === "deleted") {
      deleted += result.deleted;
    } else if (result.kind === "skipped_memory") {
      skippedByMemory++;
    } else {
      skippedAmbiguous++;
    }
  }

  console.log("\n=== 결과 ===");
  console.log(`삭제 행: ${deleted}`);
  console.log(`추억 분산 → skip: ${skippedByMemory}`);
  console.log(`자동 판단 불가 → skip: ${skippedAmbiguous}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
