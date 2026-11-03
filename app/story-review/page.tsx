import { redirect } from "next/navigation";

// Q69(2026-11-02, docs/phase/my-life-restructure.md §15) — My Life 목록 보기로 합침. 이 화면의 카드(정리할 것·오늘의
// 인터뷰·더 들어볼까요?)·이야기 고치기는 /my-life 로 옮겼다. 옛 링크·북마크는 목록 보기로.
// 2026-11-03 보존해 둔 옛 화면 본문·카드 컴포넌트·lib/story-review 삭제(§15.4) — 이 리다이렉트만 남는다.
// 인물 확인(/story-review/confirm)도 2026-11-03 삭제(§15.6) — 그 주소는 next.config.ts redirects 가 /my-life 로.
export default function StoryReviewPage() {
  redirect("/my-life?view=list");
}
