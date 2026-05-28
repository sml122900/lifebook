// Phase 6.2 점검: pgvector 가 설치돼 있고 코사인 거리 연산자(<=>)가
// vector(1024) 컬럼에서 동작하는지 확인.
//
// 실행: npx tsx db/test-vector.ts

import "dotenv/config";

import { prisma } from "../lib/db";

async function main() {
  // a and b point in opposite quadrants so cosine distance ≈ 1.
  const a = `[${Array(1024).fill(0.1).join(",")}]`;
  const b = `[${Array.from({ length: 1024 }, (_, i) => (i % 2 === 0 ? 0.1 : -0.1)).join(",")}]`;
  const rows = await prisma.$queryRawUnsafe<Array<{ same: number; diff: number }>>(
    `SELECT ($1::vector(1024) <=> $1::vector(1024))::float AS same,
            ($1::vector(1024) <=> $2::vector(1024))::float AS diff`,
    a,
    b,
  );
  console.log(rows[0]);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
