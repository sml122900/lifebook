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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">타임라인</h1>
        <p className="mt-2 text-zinc-700">
          데모: {DEMO_BIRTH_YEAR}년생 기준 · 앵커 이벤트 {events.length}개
        </p>
      </header>

      {/* 트랙 라벨 — 데스크톱에서만 */}
      <div className="sticky top-0 z-10 mb-4 hidden grid-cols-2 gap-8 border-b border-zinc-200 bg-white py-3 md:grid">
        <div className="text-sm font-semibold uppercase tracking-wide text-sky-700">
          세상 사건
        </div>
        <div className="text-sm font-semibold uppercase tracking-wide text-amber-700">
          내 사건
        </div>
      </div>

      <ol className="space-y-12">
        {years.map(([year, rows]) => (
          <li key={year}>
            <h2 className="mb-4 text-3xl font-bold text-zinc-900">{year}</h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              {/* 세상 사건 트랙 */}
              <section
                aria-label={`${year}년 세상 사건`}
                className="border-l-4 border-sky-500 pl-4 md:border-l-0 md:border-r-4 md:pl-0 md:pr-6"
              >
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-700 md:hidden">
                  세상 사건
                </h3>
                <ul className="space-y-3">
                  {rows.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border border-sky-100 bg-sky-50 p-4"
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
              </section>

              {/* 내 사건 트랙 (Phase 7에서 채워짐) */}
              <section
                aria-label={`${year}년 내 사건`}
                className="border-l-4 border-amber-500 pl-4 md:pl-6"
              >
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700 md:hidden">
                  내 사건
                </h3>
                <div className="rounded-md border border-dashed border-amber-200 bg-amber-50/50 p-4 text-zinc-500">
                  (아직 내 사건이 없습니다)
                </div>
              </section>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
