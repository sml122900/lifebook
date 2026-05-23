// Phase 9.5.1 — build the "들어보기" search URL for a song.
//
// Why a search URL, not a video id:
//   - no API key, no quota, no embed-block edge cases
//   - YouTube's own ranking picks the most-watched version, which for
//     a memory-trigger context is usually exactly what the user wants
//
// We intentionally leave the year out of the query — adding "1987"
// to "광화문 연가 이문세" pushes the result toward live versions /
// retrospectives instead of the original recording.

const SEARCH_ENDPOINT = "https://www.youtube.com/results";

export function youtubeSearchUrl(title: string, artist: string): string {
  const parts = [title, artist]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s !== "");
  const query = parts.join(" ");
  // encodeURIComponent handles Hangul, spaces, and any punctuation in
  // titles (e.g. "...Baby One More Time", "Don't") safely.
  return `${SEARCH_ENDPOINT}?search_query=${encodeURIComponent(query)}`;
}
