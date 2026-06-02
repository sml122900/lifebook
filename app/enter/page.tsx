import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getLifeEvents } from "@/lib/life-events";
import { hasAnyUserMemory } from "@/lib/user-entry";

// Phase L7 — 로그인/동의 직후 도착하는 canonical 분기 페이지.
//
// 결정 규칙:
//   1) 인생 이벤트(life_event) ≥ 1 → /life-timeline (연혁 메인)
//   2) 인생 이벤트 0, 그 외 UserMemory ≥ 1 (v2 기존 사용자)
//        → /life-timeline (빈 상태 EmptyState 가 "인생 기록 시작하기" 권유)
//   3) 둘 다 0 (완전 신규) → /life-record?new=1 (랜딩 안내와 함께)
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

  // 가장 흔한 경로(인생 이벤트 있음)에서 한 번의 조회로 결정 종료.
  const events = await getLifeEvents(userId);
  if (events.length > 0) {
    redirect("/life-timeline");
  }

  // 인생 이벤트 0 — 완전 신규냐 v2 기존이냐 확인.
  const hasOther = await hasAnyUserMemory(userId);
  if (hasOther) {
    redirect("/life-timeline");
  }

  redirect("/life-record?new=1");
}
