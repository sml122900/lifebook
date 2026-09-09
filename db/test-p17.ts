// v3 P17 — onboardingTrack 분기 DB 스모크 테스트. /enter 페이지 자체는 RSC라
// 직접 호출할 수 없어, 그 안에서 쓰는 쿼리 모양(필드명·enum 값·관계 방향)을
// 그대로 재현해 검증한다. 브라우저 E2E(가입→/start→/chat-v3→/story-review,
// 전환 배너 클릭)는 별도로 dev 서버 + 브라우저에서 확인 필요.
import "dotenv/config";

import { prisma } from "../lib/db";

const EMAIL_PREFIX = "p17-test-";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

function assert(cond: boolean, label: string) {
  console.log((cond ? "PASS" : "FAIL") + " — " + label);
  if (!cond) process.exitCode = 1;
}

async function main() {
  await cleanup();

  // 1) 기본값 V2 (스키마 기본값 확인)
  const defaultUser = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}default@test.local`, name: "기본값" },
  });
  assert(defaultUser.onboardingTrack === "V2", "신규 User.create 기본값 = V2");

  // 2) 명시적 V3 (signup/소셜 가입 경로 재현)
  const v3New = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}v3new@test.local`, name: "V3신규", onboardingTrack: "V3" },
  });
  assert(v3New.onboardingTrack === "V3", "명시적 onboardingTrack:V3 저장");

  // 3) V3 + 프로필 없음 → /enter 로직상 /start 분기 조건
  const profileNone = await prisma.onboardingProfile.findUnique({
    where: { userId: v3New.id },
    select: { skeletonGeneratedAt: true },
  });
  assert(profileNone === null, "V3 신규 — OnboardingProfile 없음 → /start 분기");

  // 4) V3 + 뼈대 완성 + UNCONFIRMED 0건 → /story-review 분기 조건
  const v3Ready = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}v3ready@test.local`, name: "V3완료", onboardingTrack: "V3" },
  });
  await prisma.onboardingProfile.create({
    data: { userId: v3Ready.id, birthYear: 1955, region: "서울", skeletonGeneratedAt: new Date() },
  });
  await prisma.lifeEvent.create({
    data: {
      userId: v3Ready.id,
      type: "BIRTH",
      label: "출생",
      year: 1955,
      sequenceOrder: 0,
      status: "CONFIRMED",
    },
  });
  const profileReady = await prisma.onboardingProfile.findUnique({
    where: { userId: v3Ready.id },
    select: { skeletonGeneratedAt: true },
  });
  const unconfirmedReady = await prisma.lifeEvent.count({
    where: { userId: v3Ready.id, status: "UNCONFIRMED" },
  });
  assert(profileReady?.skeletonGeneratedAt != null, "V3 완료 — skeletonGeneratedAt 있음");
  assert(unconfirmedReady === 0, "V3 완료 — UNCONFIRMED 0건 → /story-review 분기");

  // 5) V3 + 뼈대 완성 + UNCONFIRMED 있음 → /start 분기 유지
  await prisma.lifeEvent.create({
    data: {
      userId: v3Ready.id,
      type: "MARRIAGE",
      label: "결혼",
      sequenceOrder: 1,
      status: "UNCONFIRMED",
    },
  });
  const unconfirmedAfter = await prisma.lifeEvent.count({
    where: { userId: v3Ready.id, status: "UNCONFIRMED" },
  });
  assert(unconfirmedAfter === 1, "UNCONFIRMED 1건 생김 → 여전히 /start 분기(스토리 리뷰 아님)");

  // 6) 전환 배너 액션(switchToV3Action)의 핵심 update 재현 — V2 → V3
  const v2ToSwitch = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}switch@test.local`, name: "전환대상" },
  });
  assert(v2ToSwitch.onboardingTrack === "V2", "전환 전 V2");
  const switched = await prisma.user.update({
    where: { id: v2ToSwitch.id },
    data: { onboardingTrack: "V3" },
  });
  assert(switched.onboardingTrack === "V3", "전환 액션 재현 — V2 → V3 갱신");

  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
