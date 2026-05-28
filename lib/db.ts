// Prisma 클라이언트 싱글턴. 앱 전역에서 `import { prisma } from "@/lib/db"`.
// Prisma 7 은 driver adapter 패턴 — @prisma/adapter-pg 로 Postgres 에 연결한다
// (생성자에 datasourceUrl 직접 전달 방식은 7 에서 제거됨).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// dev 의 HMR(코드 리로드)마다 새 클라이언트가 생겨 커넥션이 누수되는 것을
// 막기 위해 globalThis 에 캐시해 재사용한다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// production 에선 전역 캐시 안 함(매 프로세스 1개). dev 에서만 재사용.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
