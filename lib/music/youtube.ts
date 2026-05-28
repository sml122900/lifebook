// Phase 9.5.1 — 곡의 "들어보기" 검색 URL 생성.
//
// 비디오 id 가 아니라 검색 URL 인 이유:
//   - API 키·쿼터·임베드 차단 엣지케이스가 없다
//   - 유튜브 자체 랭킹이 가장 많이 본 버전을 고르는데, 추억 환기
//     맥락에선 그게 보통 사용자가 원하는 바로 그 영상이다
//
// 쿼리에서 연도는 일부러 뺀다 — "광화문 연가 이문세"에 "1987"을 붙이면
// 원곡 대신 라이브/회고 영상 쪽으로 결과가 쏠린다.

const SEARCH_ENDPOINT = "https://www.youtube.com/results";

export function youtubeSearchUrl(title: string, artist: string): string {
  const parts = [title, artist]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s !== "");
  const query = parts.join(" ");
  // encodeURIComponent 가 한글·공백·제목 속 문장부호("...Baby One More
  // Time", "Don't" 등)를 안전하게 처리한다.
  return `${SEARCH_ENDPOINT}?search_query=${encodeURIComponent(query)}`;
}
