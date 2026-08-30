import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { ChatV3Client, type InitialGap } from "./ChatV3Client";

// v3 통합 채팅(P1+P2) — 신상 수집(뼈대모드) + STAGE2 확인질문 + 갭 기반 열린
// 대화가 하나의 채팅 화면으로 이어진다. /start(인트로)에서 넘어오거나, 이
// 페이지로 직접 재진입해도 ChatV3Client 가 저장된 로그 + 백엔드 실제 상태로
// 이어서 할 지점을 판단한다.
//
// `?gapEventId=<id>&gapType=confirm|episode|period` — /story-review 갭
// 카드의 [이야기하기] 가 특정 이벤트(또는 period 는 구간의 anchor 이벤트)를
// 지정해 돌아올 때(P2·P3-2). 없으면 자연 분기.
//
// ⚠️ 탐색 단계 — /enter 라우팅은 아직 이 경로를 가리키지 않는다. 기존
// /onboarding-confirm 등 v2 파이프라인은 무수정 보존.
export default async function ChatV3Page({
  searchParams,
}: {
  searchParams: Promise<{ gapEventId?: string; gapType?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { gapEventId, gapType } = await searchParams;
  const initialGap: InitialGap =
    gapEventId && (gapType === "episode" || gapType === "confirm" || gapType === "period")
      ? { eventId: gapEventId, kind: gapType }
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">이야기 나누기</h1>
        <p className="mt-2 text-lg text-ink-soft">편하게 대답만 해주세요.</p>
      </header>
      <ChatV3Client userId={session.user.id} initialGap={initialGap} />
    </main>
  );
}
