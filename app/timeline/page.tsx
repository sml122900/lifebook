import { prisma } from "@/lib/db";

// Personalization (filter by birth year) lands in Phase 5.
const DEMO_BIRTH_YEAR = 1990;

type EventRow = Awaited<ReturnType<typeof prisma.event.findMany>>[number];

function groupByYear(events: EventRow[]): Array<[number, EventRow[]]> {
  const map = new Map<number, EventRow[]>();
  for (const e of events) {
    const list = map.get(e.year) ?? [];
    list.push(e);
    map.set(e.year, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

export default async function TimelinePage() {
  const events = await prisma.event.findMany({
    where: { category: "anchor" },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const years = groupByYear(events);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-bold">타임라인</h1>
        <p className="mt-2 text-zinc-700">
          데모: {DEMO_BIRTH_YEAR}년생 기준 · 앵커 이벤트 {events.length}개
        </p>
      </header>

      <div className="relative">
        {/* 세로 중심선 */}
        <div
          aria-hidden
          className="absolute left-6 top-0 bottom-0 w-0.5 bg-zinc-300"
        />

        <ol className="space-y-12">
          {years.map(([year, rows]) => (
            <li key={year} className="relative pl-16">
              {/* 연도 마커 */}
              <div
                aria-hidden
                className="absolute left-3 top-2 h-6 w-6 rounded-full border-4 border-white bg-zinc-800 shadow"
              />
              <h2 className="text-3xl font-bold text-zinc-900">{year}</h2>
              <ul className="mt-4 space-y-3">
                {rows.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border border-zinc-200 bg-white p-4"
                  >
                    <div className="text-sm font-medium text-zinc-500">
                      {e.month
                        ? `${String(e.month).padStart(2, "0")}월`
                        : "연중"}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-zinc-900">
                      {e.title}
                    </div>
                    {e.description && (
                      <p className="mt-2 text-zinc-700">{e.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
