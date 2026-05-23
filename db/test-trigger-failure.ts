// Basket 1-2 verification: Voyage failure must NOT throw out of
// getMusicTriggersForUser. The helper should catch internally and
// return { triggers: [], failed: true } so /timeline can render the
// rest of the page and just show a small banner.
//
// We force the failure by blanking VOYAGE_API_KEY before calling — the
// embedding wrapper throws "VOYAGE_API_KEY is not set" which our
// try/catch must absorb.
//
// Run with: npx tsx db/test-trigger-failure.ts

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
