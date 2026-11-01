import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { gapMatchesTopic, getFreeChatTopic } from "@/lib/free-chat";
import { detectGaps, pickTopGaps, type Gap } from "@/lib/gap-detector";
import { INTERVIEW_COPY } from "@/lib/interview/copy";
import { getInterviewCardState, type InterviewCardState } from "@/lib/interview/session";
import { countPendingPeople } from "@/lib/node-confirm";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { CONFIRM_COPY } from "@/lib/node-confirm-copy";
import { getOnboardingTrack } from "@/lib/onboarding-track";
import { getStoryReviewData, type EpisodeSummary } from "@/lib/story-review";

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

  // 오늘의 인터뷰 진입 카드 — 오늘 기록만 1회 조회(계획 계산 없음). V3 화면이라 항상 표시.
  // 노드 그래프 2b-2 — 인물 확인 대기 수(1쿼리). 대화 종료 경로를 안 거친 경우(창 닫기 등) 보완.
  // P18-1 "진행 중" — 자유 대화에서 주제로 시작해 아직 결정 안 한 대화(My Life 개편 2단계부터 구간 주제로 판정,
  // lib/free-chat gapMatchesTopic — 이전엔 옛 대기 대화 테이블).
  const [pendingPeople, { timeline, episodes, selfEpisodes }, gaps, chatTopic, interviewCard] = await Promise.all([
    countPendingPeople(userId),
    getStoryReviewData(userId),
    detectGaps(userId),
    getFreeChatTopic(userId),
    getInterviewCardState(userId),
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
        {/* 노드 그래프 2b-3a — 같은 기록을 마인드맵으로(두 보기 공존). primary 는 맨 아래 "계속 이야기하기". */}
        <ButtonLink href="/my-life" variant="secondary" size="lg" className="mt-4">
          {MY_LIFE_COPY.storyReviewEntry}
        </ButtonLink>
      </header>

      {pendingPeople > 0 && <PendingPeopleCard count={pendingPeople} />}

      <InterviewCard state={interviewCard} />

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
          <EpisodeList episodes={episodes} />
        </section>
      )}

      {/* 노드 그래프 2a — "그때의 나"(SELF, 오늘의 인터뷰 "관계별 나")는 일반 이야기와 따로 묶는다. */}
      {selfEpisodes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">{INTERVIEW_COPY.selfStoriesTitle}</h2>
          <EpisodeList episodes={selfEpisodes} />
        </section>
      )}

      {topGaps.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-ink">더 들어볼까요?</h2>
          <div className="flex flex-col gap-3">
            {topGaps.map((gap) => {
              const inProgress = gapMatchesTopic(gap, chatTopic);
              return (
                <div
                  key={`${gap.type}:${gap.targetEventId ?? ""}:${gap.targetPersonId ?? ""}`}
                  className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-lg text-ink">{gap.cardLabel}</p>
                    {inProgress && (
                      <span className="shrink-0 rounded-full bg-banner px-3 py-1 text-lg text-action">
                        진행 중
                      </span>
                    )}
                  </div>
                  <ButtonLink
                    href={gapHref(gap)}
                    variant="secondary"
                    size="lg"
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

function EpisodeList({ episodes }: { episodes: EpisodeSummary[] }) {
  return (
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
  );
}

function PendingPeopleCard({ count }: { count: number }) {
  const C = CONFIRM_COPY;
  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-5">
      <h2 className="text-2xl font-bold text-ink">{C.reviewCardTitle}</h2>
      <p className="text-lg text-ink">{C.reviewCardDesc(count)}</p>
      <ButtonLink href="/story-review/confirm" variant="secondary" size="lg">
        {C.reviewCardButton}
      </ButtonLink>
    </section>
  );
}

function InterviewCard({ state }: { state: InterviewCardState }) {
  const C = INTERVIEW_COPY;
  const [desc, button] =
    state.kind === "before"
      ? [C.cardBefore, C.cardButtonStart]
      : state.kind === "progress"
        ? [C.cardInProgress(state.done, state.total), C.cardButtonContinue]
        : [C.cardDone, C.cardButtonDone];
  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-5">
      <h2 className="text-2xl font-bold text-ink">{C.cardTitle}</h2>
      <p className="text-lg text-ink">{desc}</p>
      <ButtonLink href="/interview" variant="secondary" size="lg">
        {button}
      </ButtonLink>
    </section>
  );
}
