import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { calcAge, formatAge } from "@/lib/age";
import { getBirthYear } from "@/lib/life-events";
import { SUBJECT_TYPE, getPerson, listEventsByPerson } from "@/lib/people";

import { DeletePersonButton } from "./DeletePersonButton";
import { UnlinkButton } from "./UnlinkButton";

// Phase P2 — 인물 상세.
//
// 상단: 인물 정보 + [수정]/[삭제]
// 하단: 함께한 인생의 순간들 (시간순) + 연결 해제 / "+ 사건 연결하기"
//
// getPerson + listEventsByPerson 모두 userId-scope 헬퍼라 권한 검증 내장.

type Params = { params: Promise<{ personId: string }> };

export async function generateMetadata({ params }: Params) {
  const { personId } = await params;
  const session = await auth();
  if (!session?.user?.id) return { title: "인물" };
  const person = await getPerson(session.user.id, personId);
  return { title: person ? person.name : "인물" };
}

export default async function PersonDetailPage({ params }: Params) {
  const { personId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [person, events, birthYear] = await Promise.all([
    getPerson(userId, personId),
    listEventsByPerson(userId, personId),
    getBirthYear(userId),
  ]);
  if (!person) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <Link
        href={`/people?tab=${person.subjectType}`}
        className="self-start text-base text-ink-soft hover:text-ink hover:underline"
      >
        ← 목록으로
      </Link>

      {/* 헤더 — 정보 + 수정/삭제 */}
      <section className="flex flex-col gap-4 rounded-md border-2 border-amber-200 bg-amber-50 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl font-bold text-ink sm:text-5xl">
            {person.name}
          </h1>
          {/* person 전용 메타 */}
          {person.subjectType === SUBJECT_TYPE.PERSON && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {person.category && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-base font-semibold text-amber-800">
                  {person.category}
                </span>
              )}
              {person.relation && (
                <span className="text-lg text-ink">{person.relation}</span>
              )}
              {person.birthYear !== null && (
                <span className="text-lg text-ink-soft">
                  {person.birthYear}년생
                  {birthYear !== null &&
                    (() => {
                      const diff = Math.abs(birthYear - (person.birthYear as number));
                      const dir = (person.birthYear as number) < birthYear ? "위" : (person.birthYear as number) > birthYear ? "아래" : "동갑";
                      return diff === 0 ? (
                        <span className="ml-1 text-base">(동갑)</span>
                      ) : (
                        <span className="ml-1 text-base">(나보다 {diff}살 {dir})</span>
                      );
                    })()}
                </span>
              )}
              {person.metYear !== null && (
                <span className="text-lg text-ink-soft">
                  {person.metYear}년에 처음 만남
                  {birthYear !== null &&
                    (() => {
                      const a = calcAge(birthYear, person.metYear as number);
                      return a ? (
                        <span className="ml-1 text-base text-ink-soft">
                          ({formatAge(a)})
                        </span>
                      ) : null;
                    })()}
                </span>
              )}
            </div>
          )}
          {person.memo && (
            <p className="mt-4 whitespace-pre-wrap text-lg text-ink">
              {person.memo}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2 sm:flex-col">
          <Link
            href={`/people/${person.id}/edit`}
            className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-base font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            수정
          </Link>
          <DeletePersonButton personId={person.id} personName={person.name} />
        </div>
      </section>

      {/* 함께한 인생의 순간들 */}
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-2xl font-bold text-ink">
            {person.subjectType === SUBJECT_TYPE.PERSON
              ? "함께한 인생의 순간들"
              : "등장한 이야기들"}
          </h2>
          <Link
            href={`/people/${person.id}/link`}
            className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-amber-600 px-5 py-2 text-base font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            + 이야기 연결하기
          </Link>
        </header>

        {events.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-line bg-surface px-5 py-8 text-center text-lg text-ink-soft">
            아직 연결된 사건이 없어요. 위의 버튼으로 함께한 순간을 골라보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="연결된 인생 사건">
            {events.map((e) => {
              const age =
                birthYear !== null ? calcAge(birthYear, e.eventYear) : null;
              const label = `${e.eventYear}${
                e.eventMonth ? `.${String(e.eventMonth).padStart(2, "0")}` : ""
              } ${e.title}`;
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-base text-ink-soft">
                      {e.eventYear}
                      {e.eventMonth ? `.${String(e.eventMonth).padStart(2, "0")}` : "년쯤"}
                      {age && (
                        <span className="ml-2 text-sm text-ink-faint">
                          (만 {age.manAge}세)
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-ink">
                      {e.title}
                    </p>
                    {e.content && (
                      <p className="mt-1 line-clamp-2 text-base text-ink-soft">
                        {e.content}
                      </p>
                    )}
                  </div>
                  <UnlinkButton
                    personId={person.id}
                    memoryId={e.id}
                    eventLabel={label}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
