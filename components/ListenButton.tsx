import { youtubeSearchUrl } from "@/lib/music/youtube";

// "▶ 들어보기" — opens a YouTube search for the song in a new tab.
// Used from any music-domain card (trigger card, saved memory card in
// /timeline, shared room timeline). target=_blank + rel=noopener so
// the new tab can't reach back into the timeline context.

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
