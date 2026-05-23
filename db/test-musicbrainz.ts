// Phase 6.4 sanity check: searches a small mixed sample against
// MusicBrainz to confirm the wrapper returns MBIDs + release years and
// that the 1.1s throttle holds between calls.
//
// Run with: npx tsx db/test-musicbrainz.ts

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
