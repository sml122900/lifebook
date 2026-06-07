import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listEraEvents, listEraSongs } from "@/lib/era-events";
import { getStashedEraEventIds } from "@/lib/era-stash";

import { EraView } from "./EraView";

// 시대 연혁 둘러보기 (Phase E1 둘러보기 + E2 클릭 담기).
// MonthEvent + ChartSong 1980~2019 카탈로그를 어르신이 카테고리·연대별로
// 보고, 마음에 남는 사건은 "내 연혁에 담기" 한 번으로 본인 연혁에 추가.
//
// 데이터: 세 fetch 병렬. 데이터 적음(사건 88·음악 73) → 페이지네이션 X.
// E2: getStashedEraEventIds 로 이미 담은 monthEventId 셋을 prefetch →
// 카드에 "✓ 내 연혁에 있어요" 즉시 표시.

export default async function EraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [events, songs, stashedIds] = await Promise.all([
    listEraEvents(),
    listEraSongs(),
    getStashedEraEventIds(session.user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          그 시절 둘러보기
        </h1>
        <p className="mt-4 text-xl text-zinc-800 sm:text-2xl">
          1980년부터 2019년까지, 우리 모두가 같이 겪은 큰 사건과 노래들이에요.
        </p>
        <p className="mt-2 text-base text-zinc-600">
          기억나는 사건은 <b>내 연혁에 담기</b> 한 번으로 본인 연혁에 추가됩니다.
        </p>
      </header>

      <EraView
        events={events}
        songs={songs}
        initialStashedIds={Array.from(stashedIds)}
      />
    </main>
  );
}
