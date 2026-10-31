import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPendingPeopleGroups } from "@/lib/node-confirm";
import { getOnboardingTrack } from "@/lib/onboarding-track";

import { ConfirmClient } from "./ConfirmClient";

// 노드 그래프 2b-2(Q6) — 이야기에 나온 인물 일괄 확인. /chat-v3 대화 종료(대기 ≥1)·
// /story-review 상단 카드·오늘의 인터뷰 요약 카드에서 들어온다. 게이트는 /story-review 와 같다
// (로그인 = proxy, V3 확인 = 이 페이지 — proxy.ts 무접촉).
export default async function StoryReviewConfirmPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  if ((await getOnboardingTrack(userId)) !== "V3") {
    redirect("/enter");
  }
  const groups = await getPendingPeopleGroups(userId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <ConfirmClient initialGroups={groups} />
    </main>
  );
}
