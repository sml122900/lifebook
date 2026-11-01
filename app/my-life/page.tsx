import { redirect } from "next/navigation";
import { Map as MapIcon } from "lucide-react";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { getMyLifeData } from "@/lib/my-life";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getOnboardingTrack } from "@/lib/onboarding-track";

import { MyLifeView } from "./MyLifeView";

// 노드 그래프 2b-3a — My Life 마인드맵(보기 전용). docs/phase/node-graph-self.md §6 2b.1.
// 로그인·동의는 proxy 가 이미 막는다(공개 경로 아님 — proxy.ts 무접촉). V3 사용자만 —
// V2 직접 진입은 /story-review 와 같이 /enter 로.

export default async function MyLifePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  if ((await getOnboardingTrack(userId)) !== "V3") {
    redirect("/enter");
  }

  const data = await getMyLifeData(userId);
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

  return <MyLifeView data={data} />;
}
