import { redirect } from "next/navigation";
import { Map as MapIcon } from "lucide-react";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { gapMatchesTopic, getFreeChatTopic } from "@/lib/free-chat";
import { detectGaps, gapChatHref, pickTopGaps } from "@/lib/gap-detector";
import { getInterviewCardState } from "@/lib/interview/session";
import { getMyLifeData } from "@/lib/my-life";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { countPendingPeople } from "@/lib/node-confirm";
import { getOnboardingTrack } from "@/lib/onboarding-track";

import { MyLifeView } from "./MyLifeView";
import type { MyLifeSuggest } from "./Suggestions";

// 노드 그래프 2b-3a — My Life 마인드맵(보기 전용). docs/phase/node-graph-self.md §6 2b.1.
// 로그인·동의는 proxy 가 이미 막는다(공개 경로 아님 — proxy.ts 무접촉). V3 사용자만 —
// V2 직접 진입은 /enter 로.
// Q69(2026-11-02) — /story-review 를 합침(옛 경로 → ?view=list). 그 화면의 카드 셋(정리할 것·오늘의 인터뷰·
// 더 들어볼까요?)을 여기서 만든다 — 목록 보기에 보이고, 지도 보기는 [이야기 거리] 시트.

export default async function MyLifePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  if ((await getOnboardingTrack(userId)) !== "V3") {
    redirect("/enter");
  }

  // 인물 확인 대기 수(1쿼리) · 오늘의 인터뷰(오늘 기록만) · 갭 · 지금 자유 대화 주제("진행 중") — 옮기기 전 /story-review 와 같은 함수.
  const [data, pendingPeople, interview, gaps, chatTopic] = await Promise.all([
    getMyLifeData(userId),
    countPendingPeople(userId),
    getInterviewCardState(userId),
    detectGaps(userId),
    getFreeChatTopic(userId),
  ]);
  const C = MY_LIFE_COPY;

  if (data.events.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <h1>{C.pageTitle}</h1>
        <p className="text-xl font-bold text-ink">{C.emptyTitle}</p>
        <EmptyState icon={MapIcon} message={C.emptyDesc} buttonLabel={C.emptyCta} href="/chat-v3" />
      </main>
    );
  }

  // pickTopGaps — 한 종류가 자리를 다 차지하지 않게 종류별로 먼저(P7-8).
  const suggest: MyLifeSuggest = {
    pendingPeople,
    interview,
    gaps: pickTopGaps(gaps, 3).map((g) => ({
      key: `${g.type}:${g.targetEventId ?? ""}:${g.targetPersonId ?? ""}`,
      label: g.cardLabel,
      href: gapChatHref(g),
      inProgress: gapMatchesTopic(g, chatTopic),
    })),
  };

  return <MyLifeView data={data} suggest={suggest} />;
}
