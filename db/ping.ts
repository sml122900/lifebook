import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const r = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("DB OK:", r);
}

main().finally(() => process.exit(0));
