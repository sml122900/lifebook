import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { withJosa } from "@/lib/josa";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";
import {
  getPerson,
  listEventsByPerson,
} from "@/lib/people";

import { LinkToggleRow } from "./LinkToggleRow";

// Phase P2 — 인물 ↔ 이벤트 연결 화면.
//
// 전체 인생 이벤트(getLifeEvents) 를 한 줄씩 보여주고, 이미 연결된 건
// "✓ 연결됨" 으로 표시. 토글 한 번에 link/unlink.
//
// N+1 회피: getLifeEvents 1쿼리 + listEventsByPerson 1쿼리(현재 링크된
// id 셋만 만들기 위해 사용).

type Params = { params: Promise<{ personId: string }> };

export const metadata = { title: "사건 연결" };

export default async function LinkEventsPage({ params }: Params) {
  const { personId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [person, allEvents, linkedEvents, birthYear] = await Promise.all([
    getPerson(userId, personId),
    getLifeEvents(userId),
    listEventsByPerson(userId, personId),
    getBirthYear(userId),
  ]);
  if (!person) notFound();

  const linkedSet = new Set(linkedEvents.map((e) => e.id));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/people/${person.id}`}
          className="self-start text-base text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          ← {person.name} 상세로
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          {person.name}
          {withJosa(person.name, "과/와")} 함께한 사건 고르기
        </h1>
        <p className="text-lg text-zinc-700">
          연혁에 있는 사건들 중 이 분과 함께한 순간을 골라주세요. 다시 누르면
          연결이 해제돼요.
        </p>
      </header>

      {allEvents.length === 0 ? (
        <section className="flex flex-col items-center gap-4 rounded-md border-2 border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <p className="text-lg text-zinc-800">
            아직 인생 사건이 없어요. 먼저 연혁에 한 장면을 더해주세요.
          </p>
          <Link
            href="/life-timeline/add"
            className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-amber-600 px-6 py-3 text-lg font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            + 인생의 한 장면 추가하기
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="인생 사건 목록">
          {allEvents.map((e) => (
            <LinkToggleRow
              key={e.id}
              event={e}
              personId={person.id}
              initialLinked={linkedSet.has(e.id)}
              birthYear={birthYear}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
