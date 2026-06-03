import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { countEventsPerPerson, listPeople } from "@/lib/people";

// Phase P2 — 인물(Person) 목록 화면.
//
// 카드 한 장 = 인물 한 분. 연결된 사건 수를 "N개 사건과 함께한 분" 으로
// 살짝 보여줘 회상의 동기를 만든다 (압박 X).
//
// N+1 회피: listPeople 1쿼리 + countEventsPerPerson(groupBy) 1쿼리 — 카드
// N장이어도 총 2쿼리.

export const metadata = { title: "인물록" };

export default async function PeopleListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [people, counts] = await Promise.all([
    listPeople(userId),
    countEventsPerPerson(userId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            인물록
          </h1>
          <p className="mt-2 text-lg text-zinc-700">
            인생에 등장한 소중한 분들을 한 곳에 모아두세요.
          </p>
        </div>
        <Link
          href="/people/new"
          className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-amber-600 px-6 py-3 text-xl font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          + 새 인물 추가
        </Link>
      </header>

      {people.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="인물 카드 목록">
          {people.map((p) => {
            const count = counts.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/people/${p.id}`}
                  className="flex flex-col gap-1 rounded-md border-2 border-zinc-200 bg-white px-5 py-4 hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-2xl font-bold text-zinc-900">
                      {p.name}
                    </span>
                    {p.relation && (
                      <span className="text-base text-zinc-700">
                        {p.relation}
                      </span>
                    )}
                    {p.metYear !== null && (
                      <span className="text-base text-zinc-600">
                        {p.metYear}년에 처음
                      </span>
                    )}
                  </div>
                  {p.memo && (
                    <p className="line-clamp-1 text-base text-zinc-700">
                      {p.memo}
                    </p>
                  )}
                  <p className="text-sm text-amber-800">
                    {count > 0
                      ? `${count}개 사건과 함께한 분`
                      : "아직 연결된 사건이 없어요"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-6 rounded-md border-2 border-amber-200 bg-amber-50 px-6 py-12 text-center">
      <p aria-hidden className="text-6xl">
        👥
      </p>
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          아직 기록된 분이 없어요
        </h2>
        <p className="mt-2 text-lg text-zinc-700">
          소중한 인연을 한 분씩 기록해보세요.
        </p>
      </div>
      <Link
        href="/people/new"
        className="inline-flex min-h-[64px] items-center justify-center rounded-md bg-amber-600 px-8 py-4 text-2xl font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      >
        + 첫 인물 추가하기
      </Link>
    </section>
  );
}
