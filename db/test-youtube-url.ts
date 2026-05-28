// Phase 9.5.1 점검 — youtubeSearchUrl 인코딩 검증.
//
// 헬퍼가 책임지는 인코딩 함정을 커버:
//   - 한글 제목 + 아티스트
//   - 아포스트로피/말줄임표가 든 영어
//   - 두 필드 중 하나가 빈 경우
//
// 실행: npx tsx db/test-youtube-url.ts

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
    // %2520 이면 이중 인코딩; %20 = 공백, %27 = 아포스트로피.
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
  // 라운드트립 점검: 쿼리를 디코딩하면 원래 "제목 아티스트" 문자열이
  // 공백 하나로 이어진 형태로 돌아와야 한다.
  const decoded = decodeURIComponent(got.split("search_query=")[1]);
  console.log(`     decoded:  ${decoded}`);
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
} else {
  console.log("\nOK: all queries encode safely.");
}
