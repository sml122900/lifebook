import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import { safeLoginReturnTo } from "@/lib/return-to";
import { hasAnyUserMemory } from "@/lib/user-entry";

// Phase L7 / B1 — 로그인/동의 직후 도착하는 canonical 분기 페이지.
// v3 P17 — onboardingTrack 이 최우선 분기. V3 사용자는 아래 v2 결정 규칙을
// 전혀 안 거치고 /start·/my-life 로만 간다(사이드 메뉴에서 v2 화면이
// 숨겨지는 것과 대칭).
//
// V3 결정 규칙:
//   1) OnboardingProfile.skeletonGeneratedAt 있고 UNCONFIRMED 이벤트 0건
//        → /my-life (My Life 개편 2단계 Q68 — 이전엔 /story-review)
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

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  // 동의 버전 재동의 게이트 — companion·free-record 와 같은 검사. session 은
  // Node auth() 의 jwt 콜백이 매번 DB 에서 다시 읽은 값이라 /consent 페이지의
  // DB 판정과 어긋나지 않는다(proxy 의 Edge JWT 와 달리 루프 없음).
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");
  // 로그인 뒤 돌아갈 주소(2026-11-08 — /login?returnTo= → /enter?next=). 동의 확인 뒤, 트랙 분기보다 먼저.
  // 우리 사이트 안 경로만(lib/return-to). 도착한 화면이 자기 게이트(트랙·골격)를 다시 본다.
  const next = safeLoginReturnTo((await searchParams).next);
  if (next) redirect(next);
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
        redirect("/my-life");
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
