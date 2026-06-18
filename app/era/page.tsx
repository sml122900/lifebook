import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listEraEvents, listEraSongs } from "@/lib/era-events";
import { getStashedEraMemories } from "@/lib/era-stash";
import { getRecordingSignedUrl } from "@/lib/storage";

import { EraView } from "./EraView";

// 시대 연혁 둘러보기 (Phase E1 둘러보기 + E2 클릭 담기).
// MonthEvent + ChartSong 1980~2019 카탈로그를 어르신이 카테고리·연대별로
// 보고, 마음에 남는 사건은 "내 연혁에 담기" 한 번으로 본인 연혁에 추가.
//
// 데이터: 세 fetch 병렬. 데이터 적음(사건 88·음악 73) → 페이지네이션 X.
// E3: getStashedEraMemories 로 (monthEventId → content + audioPath) 동시 prefetch.
// 7c: audioPath 가 있는 행에 대해 서명된 URL 발급해 EraView 에 전달.
// Map 직렬화 불가 → Object 로 변환해 EraView 에 전달.

export default async function EraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [events, songs, stashedMap] = await Promise.all([
    listEraEvents(),
    listEraSongs(),
    getStashedEraMemories(session.user.id),
  ]);

  const initialStashedMemories: Record<string, string | null> = {};
  const audioUrlPromises: Promise<[string, string] | null>[] = [];

  for (const [meId, { content, audioPath }] of stashedMap) {
    initialStashedMemories[meId] = content;
    if (audioPath) {
      audioUrlPromises.push(
        getRecordingSignedUrl(audioPath)
          .then((url) => [meId, url] as [string, string])
          .catch(() => null),
      );
    }
  }

  const audioUrlResults = await Promise.all(audioUrlPromises);
  const initialAudioSignedUrls: Record<string, string> = {};
  for (const entry of audioUrlResults) {
    if (entry) initialAudioSignedUrls[entry[0]] = entry[1];
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          그 시절 둘러보기
        </h1>
        <p className="mt-4 text-xl text-ink sm:text-2xl">
          1980년부터 2019년까지, 우리 모두가 같이 겪은 큰 사건과 노래들이에요.
        </p>
        <p className="mt-2 text-base text-ink-soft">
          기억나는 사건은 <b>내 연혁에 담기</b> 한 번으로 본인 연혁에 추가됩니다.
        </p>
      </header>

      <EraView
        events={events}
        songs={songs}
        initialStashedMemories={initialStashedMemories}
        initialAudioSignedUrls={initialAudioSignedUrls}
      />
    </main>
  );
}
