import Link from "next/link";
import { User } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { countEventsPerPerson, listPeople, type Person } from "@/lib/people";

// Phase P2 — 인물(Person) 목록 화면.
//
// 카드 한 장 = 인물 한 분. 연결된 사건 수를 "N개 사건과 함께한 분" 으로
// 살짝 보여줘 회상의 동기를 만든다 (압박 X).
//
// N+1 회피: listPeople 1쿼리 + countEventsPerPerson(groupBy) 1쿼리 — 카드
// N장이어도 총 2쿼리.

export const metadata = { title: "인물록" };

const PRESET_ORDER = ["가족", "친척", "친구", "직장", "이웃", "기타"];
const NO_CATEGORY = "미지정";

function groupByCategory(people: Person[]): [string, Person[]][] {
  const map = new Map<string, Person[]>();
  for (const p of people) {
    const key = p.category?.trim() || NO_CATEGORY;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === NO_CATEGORY) return 1;
    if (b === NO_CATEGORY) return -1;
    const ia = PRESET_ORDER.indexOf(a);
    const ib = PRESET_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, "ko");
  });
  return keys.map((k) => [k, map.get(k)!]);
}

export default async function PeopleListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [people, counts] = await Promise.all([
    listPeople(userId),
    countEventsPerPerson(userId),
  ]);

  const groups = groupByCategory(people);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            인물록
          </h1>
          <p className="mt-2 text-lg text-ink-soft">
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
        <EmptyState
          icon={User}
          message="아직 기록된 인연이 없어요"
          buttonLabel="인연 추가하기"
          href="/people/new"
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([groupName, members]) => (
            <section key={groupName}>
              <h2 className="mb-3 text-xl font-bold text-ink-soft">
                {groupName}
                <span className="ml-2 text-base font-normal text-ink-faint">
                  {members.length}명
                </span>
              </h2>
              <ul className="flex flex-col gap-3" aria-label={`${groupName} 인물 목록`}>
                {members.map((p) => {
                  const count = counts.get(p.id) ?? 0;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/people/${p.id}`}
                        className="flex flex-col gap-1 rounded-md border-2 border-line bg-surface px-5 py-4 hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-2xl font-bold text-ink">
                            {p.name}
                          </span>
                          {p.relation && (
                            <span className="text-base text-ink-soft">
                              {p.relation}
                            </span>
                          )}
                          {p.birthYear !== null && (
                            <span className="text-base text-ink-soft">
                              {p.birthYear}년생
                            </span>
                          )}
                          {p.metYear !== null && (
                            <span className="text-base text-ink-soft">
                              {p.metYear}년에 처음
                            </span>
                          )}
                        </div>
                        {p.memo && (
                          <p className="line-clamp-1 text-base text-ink-soft">
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
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
