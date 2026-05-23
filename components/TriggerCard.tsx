// Question-form music trigger card. Sits next to anchor events on the
// timeline. Visually distinct (violet, dashed inner accent, prompt
// header) so users can tell at a glance that this is a suggestion they
// can confirm or dismiss in Phase 6.8 — not a verified anchor.

type Props = {
  title: string;
  artist: string;
  year: number;
  ageAtYear: number | null;
};

export function TriggerCard({ title, artist, year, ageAtYear }: Props) {
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
    </article>
  );
}
