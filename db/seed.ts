import "dotenv/config";
import { prisma } from "../lib/db";
import { anchorEvents } from "./seed/anchorEvents";

async function main() {
  // Reset anchors to make re-runs idempotent.
  // Safe while no UserMemory rows reference Event (Phase 1 bootstrap).
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
