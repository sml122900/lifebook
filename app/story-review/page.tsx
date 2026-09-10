import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { getPendingChatContext, type PendingChatContext } from "@/lib/chat-v3-pending";
import { detectGaps, pickTopGaps, type Gap } from "@/lib/gap-detector";
import { getOnboardingTrack } from "@/lib/onboarding-track";
import { getStoryReviewData } from "@/lib/story-review";

import { EpisodeCard } from "./EpisodeCard";
import { TimelineRow } from "./TimelineRow";

// v3 통합 채팅(P2) — 정리 화면. /chat-v3 에서 뼈대를 다 채우거나 사용자가
// 대화를 마칠 때 이리로 넘어온다(ChatV3Client.finishSession). 직접 URL로도
// 언제든 들어올 수 있다 — 게이트 없이 항상 "지금까지" 스냅샷을 보여준다.
//
// v3 P17 — /enter 가 이제 이 경로를 가리킨다(V3 트랙, 온보딩 완료 시). V2
// 사용자 직접 URL 진입은 /enter 로 돌려보낸다(자동 전환 금지).

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

// P18-1 — ChatV3PendingContext(대기 대화)와 이 갭이 같은 대상인지 판정.
// stage="PERSON"은 person 갭(새 인물 이름 확인), stage="EPISODE"는 personId
// 유무로 person_episode 대 episode/time_gap 을 가른다(episode·time_gap 은
// pending 테이블에 구분 표식이 없어 — ChatV3Client.tryResumePendingContext
// 참조 — 같은 이벤트면 둘 다 매칭 대상으로 본다).
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

export default async function StoryReviewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const track = await getOnboardingTrack(userId);
  if (track !== "V3") {
    redirect("/enter");
  }

  const [{ timeline, episodes }, gaps, pending] = await Promise.all([
    getStoryReviewData(userId),
    detectGaps(userId),
    getPendingChatContext(userId),
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
              <TimelineRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </section>

      {episodes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">들려주신 이야기</h2>
          <div className="flex flex-col gap-3">
            {episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episodeId={ep.id}
                label={ep.label}
                year={ep.year}
                content={ep.content}
                familyActivityCount={ep.familyActivityCount}
              />
            ))}
          </div>
        </section>
      )}

      {topGaps.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">더 들어볼까요?</h2>
          <div className="flex flex-col gap-3">
            {topGaps.map((gap) => {
              const inProgress = matchesPending(gap, pending);
              return (
                <div
                  key={`${gap.type}:${gap.targetEventId ?? ""}:${gap.targetPersonId ?? ""}`}
                  className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-lg text-ink">{gap.cardLabel}</p>
                    {inProgress && (
                      <span className="shrink-0 rounded-full bg-banner px-3 py-1 text-base text-action">
                        진행 중
                      </span>
                    )}
                  </div>
                  <ButtonLink
                    href={gapHref(gap)}
                    variant="secondary"
                    size="md"
                    className="shrink-0"
                  >
                    {inProgress ? "이어서 이야기하기" : "이야기하기"}
                  </ButtonLink>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ButtonLink href="/chat-v3" variant="primary" size="lg">
        계속 이야기하기
      </ButtonLink>
    </main>
  );
}
