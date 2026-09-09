import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import { hasAnyUserMemory } from "@/lib/user-entry";

// Phase L7 / B1 — 로그인/동의 직후 도착하는 canonical 분기 페이지.
// v3 P17 — onboardingTrack 이 최우선 분기. V3 사용자는 아래 v2 결정 규칙을
// 전혀 안 거치고 /start·/story-review 로만 간다(사이드 메뉴에서 v2 화면이
// 숨겨지는 것과 대칭).
//
// V3 결정 규칙:
//   1) OnboardingProfile.skeletonGeneratedAt 있고 UNCONFIRMED 이벤트 0건
//        → /story-review (지금까지 채운 이야기)
//   2) 그 외(뼈대 미완성 또는 확인 대기 이벤트 있음) → /start
//
// V2 결정 규칙 (기존 그대로):
//   1) 인생 이벤트(life_event) ≥ 1 → /life-timeline (연혁 메인)
//   2) 인생 이벤트 0, 그 외 UserMemory ≥ 1 (v2 기존 사용자)
//        → /life-timeline (빈 상태 EmptyState 가 "인생 기록 시작하기" 권유)
//   3) 둘 다 0, onboardingCompletedAt null → /onboarding-chat (채팅 온보딩)
//   4) 둘 다 0, onboardingCompletedAt 있음 → /life-timeline (온보딩 완료 후 이벤트 미입력)
//
// 왜 /life-timeline 자체에 게이트를 안 두나:
//   - 기존 사용자가 사이드 패널 "내 인생 연혁" 으로 돌아왔다가 인생 이벤트
//     0건이라고 /life-record 로 튕기면 길을 잃는다.
//   - /enter 는 *처음 도착* 만 결정. 그 후 /life-timeline 은 빈 상태든
//     채워진 상태든 그대로 보여준다.
//
// proxy.ts 의 동의 게이트는 /enter 진입 전에 먼저 적용된다 — 동의 미완료
// 면 /consent 로 가고, 동의 완료 시 ConsentForm 이 /enter 로 push 한다.

export default async function EnterPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingTrack: true, onboardingCompletedAt: true },
  });

  if (user?.onboardingTrack === "V3") {
    const profile = await prisma.onboardingProfile.findUnique({
      where: { userId },
      select: { skeletonGeneratedAt: true },
    });
    if (profile?.skeletonGeneratedAt) {
      const unconfirmed = await prisma.lifeEvent.count({
        where: { userId, status: "UNCONFIRMED" },
      });
      if (unconfirmed === 0) {
        redirect("/story-review");
      }
    }
    redirect("/start");
  }

  // 가장 흔한 경로(인생 이벤트 있음)에서 한 번의 조회로 결정 종료.
  const events = await getLifeEvents(userId);
  if (events.length > 0) {
    redirect("/life-timeline");
  }

  // 인생 이벤트 0 — v2 기존 사용자냐 완전 신규냐 확인.
  const hasOther = await hasAnyUserMemory(userId);
  if (hasOther) {
    redirect("/life-timeline");
  }

  // 완전 신규(v2 트랙) — 온보딩 완료 여부로 분기.
  if (!user?.onboardingCompletedAt) {
    redirect("/onboarding-chat");
  }
  redirect("/life-timeline");
}
