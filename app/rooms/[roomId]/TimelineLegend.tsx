// Small color/label legend pinned above the room timeline so users
// have a single reference for what each card color means. Senior
// friendly: large dot, clear text, no jargon.

const ITEMS: Array<{ swatch: string; label: string }> = [
  { swatch: "bg-sky-300 border-sky-500", label: "세상 사건" },
  { swatch: "bg-amber-300 border-amber-500", label: "나의 추억" },
  { swatch: "bg-emerald-300 border-emerald-500", label: "다른 분의 추억" },
  { swatch: "bg-violet-300 border-violet-500", label: "우리의 추억" },
];

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-4 rounded-md border-2 border-zinc-200 bg-white p-4">
      {ITEMS.map((it) => (
        <li
          key={it.label}
          className="flex items-center gap-2 text-base text-zinc-800"
        >
          <span
            aria-hidden
            className={`inline-block h-5 w-5 rounded border-2 ${it.swatch}`}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
