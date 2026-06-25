import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AiModelChips } from "@/app/components/AiModelChips";
import { fetchStoryTimeline } from "@/lib/companion";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { getUserAiModel } from "@/lib/user-ai-model";
import { CompanionClient } from "./CompanionClient";
import { StoryTimelinePanel } from "./StoryTimelinePanel";

export const metadata = { title: "말동무 | 라이프북" };

export default async function CompanionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");

  const [aiModel, storyItems] = await Promise.all([
    getUserAiModel(session.user.id),
    fetchStoryTimeline(session.user.id),
  ]);

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

          <CompanionClient />
        </div>
      </div>
    </main>
  );
}
