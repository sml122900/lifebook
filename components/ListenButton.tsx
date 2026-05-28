import { youtubeSearchUrl } from "@/lib/music/youtube";

// "▶ 들어보기" — 새 탭에서 그 곡의 유튜브 검색을 연다. 음악 도메인 카드
// (트리거 카드, /timeline 저장 추억 카드, 가족 룸 타임라인) 어디서든 재사용.
// target=_blank + rel=noopener 로 새 탭이 원래 페이지 컨텍스트에 접근하지
// 못하게 막는다(보안).

export function ListenButton({
  title,
  artist,
}: {
  title: string;
  artist: string;
}) {
  return (
    <a
      href={youtubeSearchUrl(title, artist)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border-2 border-zinc-400 bg-white px-5 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
    >
      <span aria-hidden className="text-lg">
        ▶
      </span>
      <span>들어보기</span>
      <span className="sr-only">(새 탭에서 유튜브 열림)</span>
    </a>
  );
}
