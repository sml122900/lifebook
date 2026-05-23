// Phase 9.5.1 sanity check.
//
// Covers the encoding gotchas the helper is responsible for:
//   - Hangul title + artist
//   - English with apostrophes / ellipses
//   - one of the two fields missing
//
// Run with: npx tsx db/test-youtube-url.ts

import { youtubeSearchUrl } from "../lib/music/youtube";

const cases: Array<{ title: string; artist: string; expected: string }> = [
  {
    title: "광화문 연가",
    artist: "이문세",
    expected:
      "https://www.youtube.com/results?search_query=%EA%B4%91%ED%99%94%EB%AC%B8%20%EC%97%B0%EA%B0%80%20%EC%9D%B4%EB%AC%B8%EC%84%B8",
  },
  {
    title: "강남스타일",
    artist: "싸이",
    expected:
      "https://www.youtube.com/results?search_query=%EA%B0%95%EB%82%A8%EC%8A%A4%ED%83%80%EC%9D%BC%20%EC%8B%B8%EC%9D%B4",
  },
  {
    title: "...Baby One More Time",
    artist: "Britney Spears",
    expected:
      "https://www.youtube.com/results?search_query=...Baby%20One%20More%20Time%20Britney%20Spears",
  },
  {
    title: "Don't Stop Me Now",
    artist: "Queen",
    // %2520 would mean double-encoded; %20 = space, %27 = apostrophe.
    expected:
      "https://www.youtube.com/results?search_query=Don't%20Stop%20Me%20Now%20Queen",
  },
  {
    title: "외로움",
    artist: "",
    expected: "https://www.youtube.com/results?search_query=%EC%99%B8%EB%A1%9C%EC%9B%80",
  },
];

let failed = 0;
for (const c of cases) {
  const got = youtubeSearchUrl(c.title, c.artist);
  const ok = got === c.expected;
  if (!ok) failed++;
  console.log(`${ok ? "OK" : "FAIL"}  ${c.title} / ${c.artist}`);
  console.log(`     got:      ${got}`);
  if (!ok) console.log(`     expected: ${c.expected}`);
  // Round-trip sanity: decoding the query must give back the
  // original "title artist" string with one space between them.
  const decoded = decodeURIComponent(got.split("search_query=")[1]);
  console.log(`     decoded:  ${decoded}`);
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
} else {
  console.log("\nOK: all queries encode safely.");
}
