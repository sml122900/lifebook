// 앵커(검증 사건) 시드 스크립트. db/seed/anchorEvents 의 데이터를 적재.
// 실행: npx tsx db/seed.ts
import "dotenv/config";
import { prisma } from "../lib/db";
import { anchorEvents } from "./seed/anchorEvents";

async function main() {
  // 재실행을 idempotent 하게 만들려고 앵커를 먼저 초기화.
  // UserMemory 가 Event 를 참조하기 전(Phase 1 부트스트랩)이라 안전.
  const deleted = await prisma.event.deleteMany({
    where: { tier: "verified", category: "anchor" },
  });

  const created = await prisma.event.createMany({
    data: anchorEvents.map((e) => ({
      ...e,
      tier: "verified",
      category: "anchor",
    })),
  });

  console.log(
    `Anchor events: deleted ${deleted.count}, inserted ${created.count}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
