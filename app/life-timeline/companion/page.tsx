import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AiModelChips } from "@/app/components/AiModelChips";
import { ScreenTour } from "@/app/components/ScreenTour";
import { markTourCompletedAction } from "@/app/life-timeline/tour-actions";
import { fetchStoryTimeline } from "@/lib/companion";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { prisma } from "@/lib/db";
import { COMPANION_TOUR_ID, COMPANION_TOUR_STEPS } from "@/lib/tours";
import { getUserAiModel } from "@/lib/user-ai-model";
import { CompanionClient } from "./CompanionClient";
import { StoryTimelinePanel } from "./StoryTimelinePanel";

export const metadata = { title: "말동무 | 라이프북" };

export default async function CompanionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");

  const [aiModel, storyItems, userRow] = await Promise.all([
    getUserAiModel(session.user.id),
    fetchStoryTimeline(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { completedTours: true },
    }),
  ]);
  const tourSeen = userRow?.completedTours?.includes(COMPANION_TOUR_ID) ?? false;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <Link
        href="/life-timeline"
        className="self-start text-lg text-ink-soft underline-offset-4 hover:underline"
      >
        ← 인생 연혁으로
      </Link>

      {/* C2 — 데스크톱: 왼쪽 고정 패널 + 채팅 / 모바일: 토글 드로어 + 채팅 */}
      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <StoryTimelinePanel items={storyItems} />

        <div className="flex min-h-0 w-full flex-1 flex-col">
          <header className="mb-6">
            <h1 className="text-3xl font-bold text-ink">말동무</h1>
            <p className="mt-2 text-lg text-ink-soft">
              동반자가 먼저 인사할게요. 편하게 이야기해 주세요.
            </p>
          </header>

          <div className="mb-6">
            <AiModelChips current={aiModel} variant="compact" />
          </div>

          <CompanionClient firstVisitTour={!tourSeen} />
        </div>
      </div>

      {/* 코치마크 — 첫 방문 자동(오프닝 후 CompanionClient 가 START_TOUR_EVENT 로
          띄움) + "도움말" 재실행. autoStart 는 false(입력창이 늦게 나타나므로). */}
      <ScreenTour
        tourId={COMPANION_TOUR_ID}
        steps={COMPANION_TOUR_STEPS}
        autoStart={false}
        onComplete={markTourCompletedAction}
      />
    </main>
  );
}
