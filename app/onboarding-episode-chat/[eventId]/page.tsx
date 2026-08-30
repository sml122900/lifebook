import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getConfirmedLifeEvent } from "@/app/actions/life-event";

import { EpisodeChatClient } from "./EpisodeChatClient";

// STAGE4 — 에피소드 심화 대화 화면. STAGE3(/onboarding-episode)의
// [이야기하기] 버튼에서 진입한다. 대상 이벤트가 본인 소유의 CONFIRMED
// 이벤트가 아니면 STAGE3 순회 화면으로 돌려보낸다(404 대신 — STAGE3 가
// 이미 같은 목록을 다시 보여줄 수 있으므로 자연스러운 복귀).
export default async function OnboardingEpisodeChatPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { eventId } = await params;
  const item = await getConfirmedLifeEvent(session.user.id, eventId);
  if (!item) {
    redirect("/onboarding-episode");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">이야기 나누기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          편하게 말씀해 주세요. 짧게 답하셔도 괜찮아요.
        </p>
      </header>
      <EpisodeChatClient item={item} />
    </main>
  );
}
