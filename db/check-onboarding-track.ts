// 읽기 전용 — deploy 직후 실고객 계정 onboardingTrack 확인용 (P17-1 검증).
import "dotenv/config";

import { prisma } from "../lib/db";

async function main() {
  const total = await prisma.user.count();
  const v2 = await prisma.user.count({ where: { onboardingTrack: "V2" } });
  const v3 = await prisma.user.count({ where: { onboardingTrack: "V3" } });
  console.log(`전체 사용자: ${total} / V2: ${v2} / V3: ${v3}`);

  const target = await prisma.user.findUnique({
    where: { email: "sml122900@naver.com" },
    select: { id: true, email: true, name: true, onboardingTrack: true },
  });
  console.log("실고객 계정:", target);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
