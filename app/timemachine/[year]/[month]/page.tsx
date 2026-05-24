import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getMonthScreen } from "@/lib/timemachine";
import { loadTimemachineMonth } from "@/lib/timemachine-memories";

import { type EventItemData } from "./EventItem";
import {
  MonthForm,
  type EventBySection,
  type InitialState,
} from "./MonthForm";
import { SongCard } from "./SongCard";

// Phase T3 — 타임머신 월 화면.
//
// 한 (year, month) 를 받아 그달의 사건 4섹션 + 국내·해외 음악을 보여준다.
// 사건 토글·메모·월간 회고는 모두 MonthForm(클라이언트) 이 관리하며
// 단일 "저장" 버튼으로 UserMemory 행 N+1 개 (남긴 사건당 1행 +
// 월 회고 본문 있으면 1행) 묶음으로 upsert (Phase T6).
//
// 5월 국내음악 폴백: 멜론 월간 차트는 5월에 미집계라 비어있다.
// 비어있으면 한 달 이전(4월)을 가져와 "○월 기준" 라벨로 표시.

function prevMonth(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

// 검증 단계 시드 범위 (2025.6 ~ 2026.5). 시드가 확장되면 두 값 모두
// 함께 갱신 — LATEST 는 "현재"(미래 차단), EARLIEST 는 "시드 시작"
// (그 이전은 데이터 없음). 운영 진입 시 LATEST 는 new Date() 기반으로
// 교체할 자리.
const LATEST_YEAR = 2026;
const LATEST_MONTH = 5;
const EARLIEST_YEAR = 2025;
const EARLIEST_MONTH = 6;

type PageProps = {
  params: Promise<{ year: string; month: string }>;
};

export default async function TimemachineMonthPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const { year: yearStr, month: monthStr } = await params;
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    year < 1900
  ) {
    redirect("/timemachine");
  }

  const [data, saved] = await Promise.all([
    getMonthScreen(year, month),
    loadTimemachineMonth(userId, year, month),
  ]);

  // 국내음악 폴백 — 비어있으면 직전달의 차트를 가져온다.
  let domesticSongs = data.domesticSongs;
  let domesticFallbackFrom: number | null = null;
  if (domesticSongs.length === 0) {
    const prev = prevMonth(year, month);
    const fallback = await getMonthScreen(prev.year, prev.month);
    if (fallback.domesticSongs.length > 0) {
      domesticSongs = fallback.domesticSongs;
      domesticFallbackFrom = prev.month;
    }
  }

  // 섹션별 그룹핑 — MonthForm 이 이미 SECTION_ORDER 로 순회하므로
  // Record 모양으로 변환해 넘긴다.
  const eventsBySection: EventBySection = {};
  for (const e of data.events) {
    const list = eventsBySection[e.section] ?? [];
    const item: EventItemData = {
      id: e.id,
      title: e.title,
      description: e.description,
      isPeriod: e.isPeriod,
    };
    list.push(item);
    eventsBySection[e.section] = list;
  }

  const initial: InitialState = {
    keptEventIds: saved.keptEvents.map((k) => k.monthEventId),
    storyByEventId: Object.fromEntries(
      saved.keptEvents.map((k) => [k.monthEventId, k.story]),
    ),
    monthStory: saved.monthStory,
  };

  const userName = session.user.name ?? session.user.email ?? "회원";
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const atLatest =
    year * 12 + month >= LATEST_YEAR * 12 + LATEST_MONTH;
  const atEarliest =
    year * 12 + month <= EARLIEST_YEAR * 12 + EARLIEST_MONTH;

  const hasAnyMusic =
    domesticSongs.length > 0 || data.internationalSongs.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
          {year}년 {month}월
        </h1>
        <p className="mt-5 text-xl text-zinc-800 sm:text-2xl">
          이런 일이 있었어요. <b>{userName}</b>님에겐 어떤 일이 있었나요?
        </p>
      </header>

      <MonthForm
        year={year}
        month={month}
        eventsBySection={eventsBySection}
        initial={initial}
      >
        {/* 음악 — Phase T5 에서 카드 디자인. 지금은 텍스트만.
            MonthForm 내부의 사건/회고 사이에 끼움. */}
        {hasAnyMusic && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-zinc-900 sm:text-3xl">
              그 시절 음악
            </h2>

            {domesticSongs.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                  국내
                  {domesticFallbackFrom !== null && (
                    <span className="ml-2 text-base font-normal text-zinc-600">
                      ({domesticFallbackFrom}월 기준)
                    </span>
                  )}
                </h3>
                <ul className="flex flex-col gap-3">
                  {domesticSongs.map((s) => (
                    <SongCard
                      key={s.id}
                      rank={s.rank}
                      title={s.title}
                      artist={s.artist}
                      eraColor={s.eraColor}
                    />
                  ))}
                </ul>
              </div>
            )}

            {data.internationalSongs.length > 0 && (
              <div>
                <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                  해외
                </h3>
                <ul className="flex flex-col gap-3">
                  {data.internationalSongs.map((s) => (
                    <SongCard
                      key={s.id}
                      rank={s.rank}
                      title={s.title}
                      artist={s.artist}
                      eraColor={s.eraColor}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </MonthForm>

      {/* 내비게이션 — 양방향. 시대 점프(바로가기) 는 만들지 않음.
          미래(LATEST_*) 너머 + 시드 범위(EARLIEST_*) 너머는 못 감.
          12월/1월 경계는 nextMonth/prevMonth 가 처리. */}
      <nav className="flex flex-col gap-3 border-t-2 border-zinc-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
        {!atEarliest ? (
          <Link
            href={`/timemachine/${prev.year}/${prev.month}`}
            prefetch
            className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-zinc-900 px-8 py-4 text-xl font-bold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            ← {prev.year}년 {prev.month}월 보기
          </Link>
        ) : (
          <p className="text-base text-zinc-600">
            여기가 가장 오래된 달이에요.
          </p>
        )}
        {!atLatest && (
          <Link
            href={`/timemachine/${next.year}/${next.month}`}
            prefetch
            className="inline-flex min-h-[72px] items-center justify-center rounded-md border-2 border-zinc-300 px-8 py-4 text-xl font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            {next.year}년 {next.month}월 보기 →
          </Link>
        )}
      </nav>
    </main>
  );
}
