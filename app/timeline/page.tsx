import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EventCard } from "@/components/EventCard";
import { TriggerCard } from "@/components/TriggerCard";
import { prisma } from "@/lib/db";
import {
  getMusicTriggersForUser,
  type TriggerCandidate,
} from "@/lib/triggers";

type EventRow = Awaited<ReturnType<typeof prisma.event.findMany>>[number];
type MemoryRow = Awaited<ReturnType<typeof prisma.userMemory.findMany>>[number];

function indexByYear<T extends { year: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const list = map.get(r.year) ?? [];
    list.push(r);
    map.set(r.year, list);
  }
  return map;
}

export default async function TimelinePage() {
  // Soft onboarding gate: new users land on /onboarding first, but once
  // they finish (or skip) it they come straight here from then on.
  const session = await auth();
  let birthYear: number | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true, birthYear: true },
    });
    if (!user?.onboardingCompletedAt) {
      redirect("/onboarding");
    }
    birthYear = user.birthYear;
  }

  // Center the timeline on the user's lived era. With no birthYear yet
  // (skipped onboarding), fall back to every anchor — Phase 5.5 prompts
  // the user to fill it in.
  const events = await prisma.event.findMany({
    where: {
      category: "anchor",
      ...(birthYear ? { year: { gte: birthYear } } : {}),
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const anchorsByYear = indexByYear(events);

  // ⚠️ UserMemory MUST stay scoped to the current user — solo content is
  // private by Phase 3 design. Empty when the user has no memories yet
  // (Phase 7 will introduce the create flow).
  const memories = session?.user?.id
    ? await prisma.userMemory.findMany({
        where: { userId: session.user.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      })
    : [];
  const memoriesByYear = indexByYear(memories);

  // Music triggers — only when we know the user's era. Profile fields
  // default to empty arrays so a user who skipped onboarding still gets
  // generation-based recommendations.
  let triggers: TriggerCandidate[] = [];
  if (birthYear && session?.user?.id) {
    const profile = await prisma.lifeProfile.findUnique({
      where: { userId: session.user.id },
      select: { interests: true, favMusic: true },
    });
    triggers = await getMusicTriggersForUser(
      {
        birthYear,
        interests: profile?.interests ?? [],
        favMusic: profile?.favMusic ?? [],
      },
      session.user.id,
      15,
    );
  }
  const triggersByYear = indexByYear(triggers);

  // Render any year that has an anchor OR a suggested trigger.
  const yearSet = new Set<number>();
  for (const y of anchorsByYear.keys()) yearSet.add(y);
  for (const y of triggersByYear.keys()) yearSet.add(y);
  const sortedYears = Array.from(yearSet).sort((a, b) => a - b);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-zinc-900 sm:text-5xl">
          타임라인
        </h1>
        <p className="mt-3 text-zinc-800">
          {birthYear ? `${birthYear}년생 기준 · ` : ""}
          세상 사건 {events.length}개
          {triggers.length > 0 && ` · 음악 추천 ${triggers.length}곡`}
        </p>
        {!birthYear && session?.user && (
          <div className="mt-5 rounded-md border-2 border-zinc-200 bg-zinc-50 p-5">
            <p className="text-zinc-800">
              출생연도를 알려주시면 당신이 살아온 시대 위주로 보여드릴게요.
            </p>
            <Link
              href="/onboarding"
              className="mt-3 inline-block rounded-md border-2 border-zinc-300 px-5 py-3 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            >
              출생연도 입력하기
            </Link>
          </div>
        )}
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
        {sortedYears.map((year) => {
          const anchors = anchorsByYear.get(year) ?? [];
          const yearTriggers = triggersByYear.get(year) ?? [];
          const ageAtYear = birthYear !== null ? year - birthYear : null;
          return (
          <li key={year}>
            <h2 className="mb-5 flex items-baseline gap-3 text-4xl font-bold text-zinc-900 sm:text-5xl">
              <span>{year}</span>
              {ageAtYear !== null && ageAtYear >= 0 && (
                <span className="text-xl font-medium text-zinc-600 sm:text-2xl">
                  그때 {ageAtYear}살
                </span>
              )}
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              {/* 세상 사건 트랙 — 검증 앵커 + 음악 추천(질문형)을 함께 */}
              <section
                aria-label={`${year}년 세상 사건`}
                className="border-l-4 border-sky-500 pl-4 md:border-l-0 md:border-r-4 md:pl-0 md:pr-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-sky-800 md:hidden">
                  세상 사건
                </h3>
                <ul className="space-y-4">
                  {anchors.map((e) => (
                    <li key={e.id}>
                      <EventCard
                        id={e.id}
                        year={e.year}
                        month={e.month}
                        title={e.title}
                        description={e.description}
                        domain={e.domain}
                      />
                    </li>
                  ))}
                  {yearTriggers.map((t) => (
                    <li key={t.id}>
                      <TriggerCard
                        id={t.id}
                        title={t.title}
                        artist={t.artist}
                        year={t.year}
                        ageAtYear={ageAtYear}
                        status={t.status}
                      />
                    </li>
                  ))}
                </ul>
              </section>

              {/* 내 사건 트랙 (Phase 7에서 추억 입력 흐름이 들어옴) */}
              <section
                aria-label={`${year}년 내 사건`}
                className="border-l-4 border-amber-500 pl-4 md:pl-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-amber-800 md:hidden">
                  내 사건
                </h3>
                {(memoriesByYear.get(year) ?? []).length > 0 ? (
                  <ul className="space-y-4">
                    {memoriesByYear.get(year)!.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-md border-2 border-amber-300 bg-amber-50 p-5"
                      >
                        <div className="text-lg font-semibold text-zinc-900">
                          {m.title}
                        </div>
                        {m.content && (
                          <p className="mt-2 text-zinc-800">{m.content}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-md border-2 border-dashed border-amber-300 bg-amber-50 p-5">
                    <p className="text-zinc-800">
                      이 시절, 당신은 어떤 일이 있었나요?
                    </p>
                    <p className="mt-1 text-zinc-700">
                      곧 추억을 더할 수 있어요.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </li>
          );
        })}
      </ol>
    </main>
  );
}
