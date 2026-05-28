// Phase 6.4 점검: 작은 혼합 샘플을 MusicBrainz 에 검색해, 래퍼가 MBID +
// 발매연도를 돌려주고 호출 간 1.1초 스로틀이 유지되는지 확인.
//
// 실행: npx tsx db/test-musicbrainz.ts

import { searchRecording } from "../lib/musicbrainz";

const samples: Array<{ title: string; artist: string }> = [
  { title: "Bohemian Rhapsody", artist: "Queen" },
  { title: "Imagine", artist: "John Lennon" },
  { title: "강남스타일", artist: "싸이" },
  { title: "광화문 연가", artist: "이문세" },
];

async function main() {
  for (const s of samples) {
    const t0 = Date.now();
    const m = await searchRecording(s.title, s.artist);
    const elapsed = Date.now() - t0;
    console.log(
      `${s.title} / ${s.artist} → ${m ? `${m.firstReleaseYear} ${m.mbid}` : "no match"} (${elapsed}ms)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
