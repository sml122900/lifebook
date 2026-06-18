import Link from "next/link";
import { Landmark, Package, User } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { SUBJECT_TYPE, countEventsPerPerson, listPeople, type Person, type SubjectType } from "@/lib/people";

// Phase P2 + Phase 8 — 이야기 주체 목록 (인물/장소/물건 탭).
//
// 세 탭은 URL searchParam ?tab= 으로 구분 (SSR, JS 없이 탭 전환 가능).
// countEventsPerPerson 은 subjectType 무관 — 전체 주체의 연결 수.

export const metadata = { title: "인물·장소·물건" };

const CATEGORY_ORDER = ["가족", "친척", "친구", "직장", "이웃", "기타"];
const NO_CATEGORY = "미지정";

type Tab = SubjectType;

const TABS: { id: Tab; label: string; icon: typeof User; addLabel: string; emptyMsg: string }[] = [
  { id: "person",   label: "인물",   icon: User,     addLabel: "+ 새 인물 추가",  emptyMsg: "아직 기록된 인연이 없어요" },
  { id: "location", label: "장소",   icon: Landmark, addLabel: "+ 새 장소 추가",  emptyMsg: "아직 기록된 장소가 없어요" },
  { id: "thing",    label: "물건",   icon: Package,  addLabel: "+ 새 물건 추가",  emptyMsg: "아직 기록된 물건이 없어요" },
];

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
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, "ko");
  });
  return keys.map((k) => [k, map.get(k)!]);
}

export default async function PeopleListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  const activeTab: Tab =
    sp.tab === "location" || sp.tab === "thing" ? sp.tab : "person";

  const [all, counts] = await Promise.all([
    listPeople(userId),
    countEventsPerPerson(userId),
  ]);

  const filtered = all.filter((p) => p.subjectType === activeTab);
  const tab = TABS.find((t) => t.id === activeTab)!;

  // person 탭은 카테고리별 그룹. location/thing 은 단순 목록.
  const groups: [string, Person[]][] =
    activeTab === "person"
      ? groupByCategory(filtered)
      : filtered.length > 0
        ? [["", filtered]]
        : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            인물·장소·물건
          </h1>
          <p className="mt-2 text-lg text-ink-soft">
            이야기에 등장한 분·곳·것들을 한 곳에 모아두세요.
          </p>
        </div>
        <Link
          href={`/people/new?type=${activeTab}`}
          className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-amber-600 px-6 py-3 text-xl font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          {tab.addLabel}
        </Link>
      </header>

      {/* 탭 */}
      <nav
        aria-label="주체 종류"
        className="flex gap-1 rounded-md border-2 border-line bg-banner p-1"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = all.filter((p) => p.subjectType === t.id).length;
          const isActive = t.id === activeTab;
          return (
            <Link
              key={t.id}
              href={`/people?tab=${t.id}`}
              className={[
                "flex flex-1 min-h-[48px] items-center justify-center gap-2 rounded px-3 py-2 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500",
                isActive
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={16} aria-hidden />
              {t.label}
              <span className={isActive ? "text-amber-700" : "text-ink-faint"}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={tab.icon}
          message={tab.emptyMsg}
          buttonLabel={tab.addLabel}
          href={`/people/new?type=${activeTab}`}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([groupName, members]) => (
            <section key={groupName || "__all__"}>
              {groupName && (
                <h2 className="mb-3 text-xl font-bold text-ink-soft">
                  {groupName}
                  <span className="ml-2 text-base font-normal text-ink-faint">
                    {members.length}명
                  </span>
                </h2>
              )}
              <ul
                className="flex flex-col gap-3"
                aria-label={`${tab.label} 목록`}
              >
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
                          {/* person 전용 메타 */}
                          {p.subjectType === SUBJECT_TYPE.PERSON && (
                            <>
                              {p.relation && (
                                <span className="text-base text-ink-soft">{p.relation}</span>
                              )}
                              {p.birthYear !== null && (
                                <span className="text-base text-ink-soft">{p.birthYear}년생</span>
                              )}
                              {p.metYear !== null && (
                                <span className="text-base text-ink-soft">{p.metYear}년에 처음</span>
                              )}
                            </>
                          )}
                        </div>
                        {p.memo && (
                          <p className="line-clamp-1 text-base text-ink-soft">
                            {p.memo}
                          </p>
                        )}
                        <p className="text-sm text-amber-800">
                          {count > 0
                            ? `${count}개 사건과 함께`
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
