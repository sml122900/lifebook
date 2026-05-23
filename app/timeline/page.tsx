import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EventCard } from "@/components/EventCard";
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
  // Soft onboarding gate: new users land on /onboarding first, but once
  // they finish (or skip) it they come straight here from then on.
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true },
    });
    if (!user?.onboardingCompletedAt) {
      redirect("/onboarding");
    }
  }

  const events = await prisma.event.findMany({
    where: { category: "anchor" },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const years = groupByYear(events);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-zinc-900 sm:text-5xl">
          타임라인
        </h1>
        <p className="mt-3 text-zinc-800">
          데모: {DEMO_BIRTH_YEAR}년생 기준 · 앵커 이벤트 {events.length}개
        </p>
      </header>

      {/* 트랙 라벨 — 데스크톱에서만 */}
      <div className="sticky top-0 z-10 mb-6 hidden grid-cols-2 gap-8 border-b-2 border-zinc-300 bg-white py-3 md:grid">
        <div className="text-base font-bold uppercase tracking-wide text-sky-800">
          세상 사건
        </div>
        <div className="text-base font-bold uppercase tracking-wide text-amber-800">
          내 사건
        </div>
      </div>

      <ol className="space-y-14">
        {years.map(([year, rows]) => (
          <li key={year}>
            <h2 className="mb-5 text-4xl font-bold text-zinc-900 sm:text-5xl">
              {year}
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              {/* 세상 사건 트랙 */}
              <section
                aria-label={`${year}년 세상 사건`}
                className="border-l-4 border-sky-500 pl-4 md:border-l-0 md:border-r-4 md:pl-0 md:pr-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-sky-800 md:hidden">
                  세상 사건
                </h3>
                <ul className="space-y-4">
                  {rows.map((e) => (
                    <li key={e.id}>
                      <EventCard
                        year={e.year}
                        month={e.month}
                        title={e.title}
                        description={e.description}
                        domain={e.domain}
                      />
                    </li>
                  ))}
                </ul>
              </section>

              {/* 내 사건 트랙 (Phase 7에서 채워짐) */}
              <section
                aria-label={`${year}년 내 사건`}
                className="border-l-4 border-amber-500 pl-4 md:pl-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-amber-800 md:hidden">
                  내 사건
                </h3>
                <div className="rounded-md border-2 border-dashed border-amber-300 bg-amber-50 p-5">
                  <p className="text-zinc-800">
                    이 시절, 당신은 어떤 일이 있었나요?
                  </p>
                  <p className="mt-1 text-zinc-700">
                    곧 추억을 더할 수 있어요.
                  </p>
                </div>
              </section>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
