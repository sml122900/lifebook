// 룸 타임라인 위에 고정해, 카드 색이 뜻하는 바를 한곳에서 참조하게 하는
// 작은 색상/라벨 범례. 시니어 친화: 큰 점, 명확한 텍스트, 전문용어 없음.

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
