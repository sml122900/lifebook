import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const events = await prisma.event.findMany({
    where: { category: "anchor" },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: {
      year: true,
      month: true,
      title: true,
      domain: true,
      region: true,
    },
  });

  console.log(`Total: ${events.length}`);
  for (const e of events) {
    const m = e.month?.toString().padStart(2, "0") ?? "--";
    console.log(`${e.year}.${m}  [${e.region}/${e.domain}]  ${e.title}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
