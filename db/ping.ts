// DB 연결 확인용 최소 스크립트. `SELECT 1` 로 Postgres 접속이 되는지만 본다.
// 실행: npx tsx db/ping.ts
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const r = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("DB OK:", r);
}

main().finally(() => process.exit(0));
