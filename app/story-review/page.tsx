import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { detectGaps, pickTopGaps, type Gap } from "@/lib/gap-detector";
import { getStoryReviewData } from "@/lib/story-review";

// v3 통합 채팅(P2) — 정리 화면. /chat-v3 에서 뼈대를 다 채우거나 사용자가
// 대화를 마칠 때 이리로 넘어온다(ChatV3Client.finishSession). 직접 URL로도
// 언제든 들어올 수 있다 — 게이트 없이 항상 "지금까지" 스냅샷을 보여준다.
//
// ⚠️ 탐색 단계 — /enter 라우팅은 아직 이 경로를 가리키지 않는다.

const EPISODE_EXCERPT_LENGTH = 120;

function gapHref(gap: Gap): string {
  if (!gap.targetEventId) return "/chat-v3";
  if (gap.type === "episode") {
    return `/chat-v3?gapEventId=${gap.targetEventId}&gapType=episode`;
  }
  if (gap.type === "time_gap") {
    return `/chat-v3?gapEventId=${gap.targetEventId}&gapType=period`;
  }
  if (gap.type === "person") {
    return `/chat-v3?gapEventId=${gap.targetEventId}&gapType=person`;
  }
  if (gap.type === "person_episode" && gap.targetPersonId) {
    return `/chat-v3?gapEventId=${gap.targetEventId}&gapType=person_episode&gapPersonId=${gap.targetPersonId}`;
  }
  return `/chat-v3?gapEventId=${gap.targetEventId}&gapType=confirm`;
}

export default async function StoryReviewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const [{ timeline, episodes }, gaps] = await Promise.all([
    getStoryReviewData(userId),
    detectGaps(userId),
  ]);
  // P7-8 — 단순 slice(0,3) 는 한 타입(person/person_episode 등)이 수가
  // 많으면 다른 타입(특히 time_gap)을 화면에서 영영 안 보이게 가릴 수
  // 있다. pickTopGaps 가 타입별 다양성을 먼저 보장한다.
  const topGaps = pickTopGaps(gaps, 3);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">지금까지 채운 이야기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          채워진 인생 이야기를 한눈에 보여드릴게요.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">타임라인</h2>
        {timeline.length === 0 ? (
          <p className="text-lg text-ink-soft">아직 채워진 이야기가 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {timeline.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg text-ink">
                    {item.year ? `${item.year}년 ` : ""}
                    {item.label}
                  </span>
                  {item.hasEpisode && (
                    <span className="shrink-0 rounded-full bg-banner px-3 py-1 text-base text-ink-soft">
                      이야기 있음
                    </span>
                  )}
                </div>
                {item.people.length > 0 && (
                  <p className="text-base text-ink-soft">
                    👤 {item.people.map((p) => p.name).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {episodes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">들려주신 이야기</h2>
          <div className="flex flex-col gap-3">
            {episodes.map((ep) => (
              <div key={ep.id} className="rounded-md border-2 border-line bg-surface p-5">
                <p className="text-lg font-semibold text-ink">
                  {ep.year ? `${ep.year}년 ` : ""}
                  {ep.label}
                </p>
                <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                  {ep.content.length > EPISODE_EXCERPT_LENGTH
                    ? `${ep.content.slice(0, EPISODE_EXCERPT_LENGTH)}…`
                    : ep.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {topGaps.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">더 들어볼까요?</h2>
          <div className="flex flex-col gap-3">
            {topGaps.map((gap) => (
              <div
                key={`${gap.type}:${gap.targetEventId ?? ""}:${gap.targetPersonId ?? ""}`}
                className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-lg text-ink">{gap.cardLabel}</p>
                <ButtonLink
                  href={gapHref(gap)}
                  variant="secondary"
                  size="md"
                  className="shrink-0"
                >
                  이야기하기
                </ButtonLink>
              </div>
            ))}
          </div>
        </section>
      )}

      <ButtonLink href="/chat-v3" variant="primary" size="lg">
        계속 이야기하기
      </ButtonLink>
    </main>
  );
}
