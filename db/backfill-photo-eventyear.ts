// Phase Photo (3단계) 백필 — 2단계에서 만든 기존 photo 메모리는 eventYear/
// eventMonth 가 비어 있어 getLifeEvents(eventYear 기준 where/orderBy)에서 빠진다.
// year/month 값을 eventYear/eventMonth 로 미러링한다. createdVia="photo" +
// eventYear IS NULL 인 행만 — idempotent(두 번 돌려도 0행). dev 데이터 대상.
//
// 실행: npx tsx db/backfill-photo-eventyear.ts

import "dotenv/config";

import { prisma } from "../lib/db";

async function main() {
  const before = await prisma.userMemory.count({
    where: { createdVia: "photo", eventYear: null },
  });
  console.log(`[backfill] 대상(createdVia=photo, eventYear IS NULL): ${before}행`);

  const updated = await prisma.$executeRaw`
    UPDATE "UserMemory"
    SET "eventYear" = "year", "eventMonth" = "month"
    WHERE "createdVia" = 'photo' AND "eventYear" IS NULL
  `;
  console.log(`[backfill] UPDATE 적용: ${updated}행`);

  const after = await prisma.userMemory.count({
    where: { createdVia: "photo", eventYear: null },
  });
  console.log(`[backfill] 남은 미백필(0이어야 정상): ${after}행`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
