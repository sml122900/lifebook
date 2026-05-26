// MonthEvent 중복 진단.
//
// (year, month, section, title) 같은데 id 가 다른 행을 그룹화.
// 각 그룹의 행마다:
//   - id (deterministic 24-hex 인지, 옛 cuid 인지)
//   - UserMemory.monthEventId 로 참조하는 추억 개수
// 를 보여준다. 삭제 결정에 필요한 정보 모두 포함.

import "dotenv/config";
import { prisma } from "../lib/db";

type GroupRow = {
  year: number | null;
  month: number | null;
  section: string;
  title: string;
  cnt: number;
};

type DetailRow = {
  id: string;
  year: number | null;
  month: number | null;
  section: string;
  title: string;
  description: string;
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
  if (groups.length === 0) {
    return;
  }

  let totalRows = 0;
  let totalDupRows = 0;
  let toDelete = 0;
  let warnings = 0;

  for (const g of groups) {
    totalRows += g.cnt;
    totalDupRows += g.cnt - 1; // 그룹당 1개만 정답, 나머지가 중복

    console.log(
      `\n[${g.year}.${g.month} ${g.section}] "${g.title}" — ${g.cnt}건`,
    );

    const rows = await prisma.$queryRaw<DetailRow[]>`
      SELECT id, "year", "month", "section"::text AS section, "title", "description"
      FROM "MonthEvent"
      WHERE COALESCE("year", -1) = COALESCE(${g.year}, -1)
        AND COALESCE("month", -1) = COALESCE(${g.month}, -1)
        AND "section"::text = ${g.section}
        AND "title" = ${g.title}
      ORDER BY id
    `;

    for (const r of rows) {
      const memCount = await prisma.userMemory.count({
        where: { monthEventId: r.id },
      });
      const kind = isDeterministicId(r.id) ? "deterministic" : "old cuid";
      const memMark = memCount > 0 ? ` ★memories=${memCount}` : "";
      console.log(`  - ${r.id}  (${kind})${memMark}`);
    }

    // 그룹의 보존 후보 / 삭제 후보 계산
    const withMem = await Promise.all(
      rows.map(async (r) => ({
        r,
        memCount: await prisma.userMemory.count({
          where: { monthEventId: r.id },
        }),
        det: isDeterministicId(r.id),
      })),
    );
    const memoryAttached = withMem.filter((x) => x.memCount > 0);

    if (memoryAttached.length > 1) {
      // 위험: 여러 행에 추억이 흩어져 있음 — 자동 삭제 금지
      console.log(
        `  ⚠️ 여러 행에 추억이 흩어져 있음 (${memoryAttached.length}건) — 수동 검토 필요. 이 그룹은 건너뜀.`,
      );
      warnings++;
      continue;
    }

    let keeperId: string;
    if (memoryAttached.length === 1) {
      keeperId = memoryAttached[0].r.id;
    } else {
      // 추억 연결 없음 → deterministic id 우선
      const det = withMem.find((x) => x.det);
      keeperId = det ? det.r.id : withMem[0].r.id;
    }
    const dropIds = withMem.filter((x) => x.r.id !== keeperId).map((x) => x.r.id);
    toDelete += dropIds.length;

    console.log(`  → 보존: ${keeperId}`);
    for (const d of dropIds) {
      console.log(`  → 삭제 예정: ${d}`);
    }
  }

  console.log("\n=== 요약 ===");
  console.log(`중복 그룹 수: ${groups.length}`);
  console.log(`중복 그룹의 총 행: ${totalRows}`);
  console.log(`이론상 줄어야 할 행: ${totalDupRows}`);
  console.log(`자동 삭제 예정: ${toDelete}`);
  console.log(`수동 검토 그룹: ${warnings}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
