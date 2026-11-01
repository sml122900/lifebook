import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getConfirmedLifeEvent } from "@/app/actions/life-event";

import { EpisodeChatClient } from "./EpisodeChatClient";

// 2026-11-02 닫음 — 앱 안에 들어오는 길이 없다(/onboarding-v2 → /onboarding-confirm → /onboarding-episode 사슬
// 안에서만 이어지고, 그 첫 화면 /onboarding-v2 로 오는 링크·redirect 가 0). 이 화면의 저장(finishEpisodeChatCore)은
// 이야기 제목 칸에 시기 이름을 넣던 마지막 옛 경로라, 같은 시기의 자유 대화(/chat-v3 주제 — 제안 카드)로 보낸다.
// 직접 URL·옛 북마크·/onboarding-episode 의 [이야기하기]를 흡수한다. docs/phase/my-life-restructure.md §13.5.
//
// 코드 보존: 아래 _OnboardingEpisodeChatPageArchived 와 EpisodeChatClient 그대로. 되살리기 = default export 교체.
export default async function OnboardingEpisodeChatPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(`/chat-v3?gapEventId=${encodeURIComponent(eventId)}&gapType=episode`);
}

// ─────────────────────────────────────────────────────────────────────────
// 이하 보존 — STAGE4 에피소드 심화 대화 화면 원본. 사용 0(default export 가 위 redirect 로 교체됨).
// ─────────────────────────────────────────────────────────────────────────

// STAGE4 — 에피소드 심화 대화 화면. STAGE3(/onboarding-episode)의
// [이야기하기] 버튼에서 진입한다. 대상 이벤트가 본인 소유의 CONFIRMED
// 이벤트가 아니면 STAGE3 순회 화면으로 돌려보낸다(404 대신 — STAGE3 가
// 이미 같은 목록을 다시 보여줄 수 있으므로 자연스러운 복귀).
async function _OnboardingEpisodeChatPageArchived({
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

// 보존된 함수에 대한 unused-vars 경고 억제(app/timeline/page.tsx 와 같은 패턴).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __preserve_archived_exports = {
  _OnboardingEpisodeChatPageArchived,
};
