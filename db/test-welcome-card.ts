// 첫 방문 환영 카드 — 표시 조건 + 1회성 종료 검증 (DB 레이어).
//
// page.tsx 의 표시 조건(showWelcome)과 dismissWelcomeAction 의 핵심 쿼리
// (updateMany where onboardingCompletedAt: null)를 임시 사용자로 재현한다.
// 실행: npx tsx db/test-welcome-card.ts

import "dotenv/config";

import { prisma } from "../lib/db";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  const user = await prisma.user.create({
    data: { email: `welcome-test-${Date.now()}@test.local`, name: "환영테스트" },
  });

  try {
    // [1] 신규 사용자 — 카드 뜸 (onboardingCompletedAt null + 이벤트 0)
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    });
    const eventCount = await prisma.userMemory.count({
      where: { userId: user.id, createdVia: { in: ["life_event", "era_event", "photo"] } },
    });
    assert(
      "신규 사용자: showWelcome 조건 true",
      fresh?.onboardingCompletedAt == null && eventCount === 0,
    );

    // [2] 닫기 — dismissWelcomeAction 핵심 쿼리. 1행 갱신돼야 함.
    const r1 = await prisma.user.updateMany({
      where: { id: user.id, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
    assert("닫기: null 행 1건 갱신", r1.count === 1);

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    });
    assert("재방문: showWelcome 조건 false", after?.onboardingCompletedAt != null);

    // [3] 중복 닫기 — 이미 찍힌 시각을 덮어쓰지 않음 (count 0)
    const firstStamp = after!.onboardingCompletedAt!;
    const r2 = await prisma.user.updateMany({
      where: { id: user.id, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });
    const final = await prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingCompletedAt: true },
    });
    assert(
      "중복 닫기: 갱신 0건 + 원래 시각 보존",
      r2.count === 0 &&
        final!.onboardingCompletedAt!.getTime() === firstStamp.getTime(),
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log(`\n환영 카드: ${passed} 통과 / ${failed} 실패`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
