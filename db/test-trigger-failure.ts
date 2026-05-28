// 바구니 1-2 검증: Voyage 실패가 getMusicTriggersForUser 밖으로 throw
// 되면 안 된다. 헬퍼가 내부에서 catch 해 { triggers: [], failed: true }
// 를 반환 → /timeline 이 나머지 페이지를 렌더하고 작은 배너만 띄우게.
//
// VOYAGE_API_KEY 를 비워 실패를 강제한다 — 임베딩 래퍼가 "VOYAGE_API_KEY
// is not set" 을 throw 하고, 우리 try/catch 가 이를 흡수해야 한다.
//
// 실행: npx tsx db/test-trigger-failure.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { getMusicTriggersForUser } from "../lib/triggers";

async function main() {
  // Force the embed call to throw.
  const originalKey = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = "";

  const result = await getMusicTriggersForUser(
    {
      birthYear: 1965,
      interests: ["음악"],
      favMusic: ["이문세"],
    },
    null,
    10,
  );

  // Restore so any later code in this process behaves normally.
  if (originalKey !== undefined) {
    process.env.VOYAGE_API_KEY = originalKey;
  }

  console.log("result:", result);

  const failures: string[] = [];
  if (!result.failed) failures.push("expected failed=true when Voyage key is empty");
  if (result.triggers.length !== 0)
    failures.push(`expected empty triggers, got ${result.triggers.length}`);

  if (failures.length > 0) {
    console.error("\nFAILED:");
    for (const f of failures) console.error("  - " + f);
    process.exitCode = 1;
  } else {
    console.log("\nOK: failure is caught and returned, no throw propagates.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("UNEXPECTED THROW (the whole point is no throw escapes):", err);
  await prisma.$disconnect();
  process.exit(1);
});
