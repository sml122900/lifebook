import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { EpisodeClient } from "./EpisodeClient";

// STAGE3 — 확인된(CONFIRMED) LifeEvent 를 하나씩 보여주며 심화(에피소드) 여부를
// 묻는 화면. STAGE2(/onboarding-confirm) 완료 직후 자동으로 이 라우트로
// 넘어온다. /enter 라우팅은 아직 이 경로를 가리키지 않는다.
//
// `?after=<eventId>` — STAGE4(에피소드 대화) 종료 후 돌아올 때, 방금 이야기한
// 이벤트 다음부터 이어가라는 신호. 서버 컴포넌트에서 읽어 client 로 넘긴다
// (useSearchParams 의 Suspense 요구 없이 단순하게).
export default async function OnboardingEpisodePage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { after } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">이야기를 들어볼게요</h1>
        <p className="mt-2 text-lg text-ink-soft">
          확인한 이야기 칸을 하나씩 더 채워봐요.
        </p>
      </header>
      <EpisodeClient userId={session.user.id} afterEventId={after ?? null} />
    </main>
  );
}
