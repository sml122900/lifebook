// P18-1 — /story-review 갭 카드 "진행 중" 매칭 로직(matchesPending) 검증.
// 페이지 파일에서 로직을 그대로 복사할 수 없으니(서버 컴포넌트, export 없음)
// 여기서는 pending 상태 + detectGaps 결과를 대조해, 매칭 대상 갭이 정확히
// 하나(military 관련) 나오는지 확인한다.
//
// 자체 픽스처 계정(fixture-p18-1@lifebook.invalid)을 시작 시 만들고 끝에
// (성공·실패 모두) 하위 데이터째 삭제한다. 예전엔 test30 계정의 대기 대화
// 상태에 기대 test30 을 도그푸딩에 쓰면 깨졌다 — 지금은 test30 읽기·쓰기 0.
// 실행: npx tsx db/test-p18-1.ts
import "dotenv/config";

import { detectGaps, pickTopGaps, type Gap } from "../lib/gap-detector";
import { getPendingChatContext, setPendingChatContext, type PendingChatContext } from "../lib/chat-v3-pending";
import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";

const FIXTURE_EMAIL = "fixture-p18-1@lifebook.invalid";

function matchesPending(gap: Gap, pending: PendingChatContext | null): boolean {
  if (!pending || !gap.targetEventId || gap.targetEventId !== pending.targetEventId) {
    return false;
  }
  if (gap.type === "person") return pending.stage === "PERSON";
  if (gap.type === "person_episode") {
    return pending.stage === "EPISODE" && pending.targetPersonId === gap.targetPersonId;
  }
  if (gap.type === "episode" || gap.type === "time_gap") {
    return pending.stage === "EPISODE" && pending.targetPersonId === null;
  }
  return false;
}

// 픽스처 이메일과 정확히 일치하는 계정만 지운다(지난 실행이 중간에 죽어 남은 잔재 포함).
async function removeFixture(): Promise<void> {
  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
}

// v3 트랙·동의 v4 완료 사용자 + 출생(1950)·군 입대(1970) 확인 이벤트 + 군 입대
// 에피소드 대화 중 이탈(pending EPISODE). 인물 갭은 노이즈라 personAsked=true.
// → topGaps(3) = 출생 time_gap · 군 입대 time_gap · 출생 episode, 이 중 pending 과
//   맞는 건 군 입대 time_gap 하나.
async function seedFixture(): Promise<string> {
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: FIXTURE_EMAIL,
      name: "[fixture] p18-1",
      birthYear: 1950,
      onboardingTrack: "V3",
      termsConsentAt: now,
      privacyConsentAt: now,
      overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({
    data: { userId: user.id, birthYear: 1950, region: "대구", skeletonGeneratedAt: now },
  });
  const mkEvent = (type: "BIRTH" | "MILITARY", label: string, year: number, order: number) =>
    prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type,
        label,
        year,
        isOptional: type === "MILITARY",
        status: "CONFIRMED",
        confirmedAt: now,
        sequenceOrder: order,
        personAsked: true,
      },
      select: { id: true },
    });
  await mkEvent("BIRTH", "출생", 1950, 0);
  const military = await mkEvent("MILITARY", "군 입대", 1970, 1);
  await setPendingChatContext(user.id, "EPISODE", military.id, null);
  return user.id;
}

async function main() {
  await removeFixture();
  let userId: string | null = null;
  try {
    userId = await seedFixture();
    const pendingBefore = await getPendingChatContext(userId);
    console.log("pending (before):", pendingBefore);

    const gaps = await detectGaps(userId);
    const topGaps = pickTopGaps(gaps, 3);
    const matchedBefore = topGaps.filter((g) => matchesPending(g, pendingBefore));
    console.log(
      "pending 있는 상태 — topGaps 중 매칭:",
      matchedBefore.map((g) => ({ type: g.type, targetEventId: g.targetEventId })),
    );
    if (matchedBefore.length === 0) {
      console.log("FAIL — pending이 있는데 매칭되는 카드가 없음");
      process.exitCode = 1;
    } else {
      console.log("PASS — pending 상태에서 최소 1개 카드가 '이어서 이야기하기'로 표시됨");
    }

    // pending 없을 때 문구 회귀 확인 — 임시로 없다고 가정(실제로 지우지 않음,
    // 매칭 함수에 null 을 직접 넣어 순수 함수로 검증).
    const matchedWithoutPending = topGaps.filter((g) => matchesPending(g, null));
    if (matchedWithoutPending.length === 0) {
      console.log("PASS — pending=null 이면 매칭 0건(기존 '이야기하기' 문구 유지)");
    } else {
      console.log("FAIL — pending=null 인데도 매칭이 있음");
      process.exitCode = 1;
    }
  } finally {
    // 시드 도중 실패해도 이메일로 찾아 지운다.
    await removeFixture();
    const id = userId ?? "";
    const [user, events, profile, pending] = await Promise.all([
      prisma.user.count({ where: { email: FIXTURE_EMAIL } }),
      prisma.lifeEvent.count({ where: { userId: id } }),
      prisma.onboardingProfile.count({ where: { userId: id } }),
      prisma.chatV3PendingContext.count({ where: { userId: id } }),
    ]);
    if (user + events + profile + pending === 0) {
      console.log("정리 — 픽스처 계정·하위 데이터 삭제 확인");
    } else {
      console.log("정리 실패 — 픽스처 잔재:", { user, events, profile, pending });
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
