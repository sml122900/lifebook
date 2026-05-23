import Link from "next/link";

import { confirmTrigger, dismissTrigger } from "@/app/timeline/actions";
import { youtubeSearchUrl } from "@/lib/music/youtube";

// Question-form music trigger card. Sits next to anchor events on the
// timeline. Visually distinct (violet, prompt header) so users can tell
// at a glance that this is a suggestion they can confirm or dismiss —
// not a verified anchor.
//
// Three visual states:
//   - unanswered: violet, "이 노래, 기억나세요?" + two buttons
//   - confirmed:  emerald, "✓ 기억나는 곡" (kept for Phase 7 memories)
//   - dismissed:  not rendered — filtered out in lib/triggers.ts

type Props = {
  id: string;
  title: string;
  artist: string;
  year: number;
  ageAtYear: number | null;
  status: "confirmed" | null;
};

// "들어보기" — a YouTube search opens in a new tab so the listener
// doesn't lose their place in the timeline. Hearing the melody is
// what makes the title actually trigger a memory; it sits BEFORE the
// 기억나요/잘 모르겠어요 decision so a listen-then-decide flow is
// natural.
function ListenButton({ title, artist }: { title: string; artist: string }) {
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

export function TriggerCard({
  id,
  title,
  artist,
  year,
  ageAtYear,
  status,
}: Props) {
  if (status === "confirmed") {
    return (
      <article className="rounded-md border-2 border-emerald-400 bg-emerald-50 p-5">
        <p className="text-base font-bold uppercase tracking-wide text-emerald-800">
          ✓ 기억나는 곡
        </p>
        <h4 className="mt-3 text-2xl font-bold text-zinc-900">{title}</h4>
        <p className="mt-1 text-lg text-zinc-800">{artist}</p>
        <p className="mt-3 text-base text-zinc-700">
          {year}
          {ageAtYear !== null && ageAtYear >= 0 && (
            <span className="ml-2 text-zinc-600">· 그때 {ageAtYear}살</span>
          )}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ListenButton title={title} artist={artist} />
          <Link
            href={`/memory/${id}`}
            className="rounded-md bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          >
            이 노래로 추억 남기기 →
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-md border-2 border-violet-300 bg-violet-50 p-5">
      <p className="text-base font-bold uppercase tracking-wide text-violet-800">
        이 노래, 기억나세요?
      </p>
      <h4 className="mt-3 text-2xl font-bold text-zinc-900">{title}</h4>
      <p className="mt-1 text-lg text-zinc-800">{artist}</p>
      <p className="mt-3 text-base text-zinc-700">
        {year}
        {ageAtYear !== null && ageAtYear >= 0 && (
          <span className="ml-2 text-zinc-600">· 그때 {ageAtYear}살</span>
        )}
      </p>

      {/* Listen first, then decide. Separate row so it doesn't get
          lost among the decision buttons. */}
      <div className="mt-4">
        <ListenButton title={title} artist={artist} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={confirmTrigger}>
          <input type="hidden" name="eventId" value={id} />
          <button
            type="submit"
            className="rounded-md bg-violet-700 px-5 py-3 text-base font-semibold text-white hover:bg-violet-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
          >
            기억나요
          </button>
        </form>
        <form action={dismissTrigger}>
          <input type="hidden" name="eventId" value={id} />
          <button
            type="submit"
            className="rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-base font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            잘 모르겠어요
          </button>
        </form>
      </div>
    </article>
  );
}
