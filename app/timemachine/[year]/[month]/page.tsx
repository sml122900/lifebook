import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listAssistantAnswers } from "@/lib/timemachine-assistant-saved";
import { loadTimemachineMonth } from "@/lib/timemachine-memories";

import type { InitialSavedAnswer } from "./AssistantPanel";
import { MonthV2, type MonthV2Initial } from "./MonthV2";

// Phase V2 — 타임머신 월 화면 (AI 비서 + 기억칸).
//
// v1 의 "사건 펼쳐보기" 그리드와 자동 음악 섹션은 제거. 비서가 사용자가
// 묻는 것에만 답한다. 사용자가 비서 답에서 "내 타임라인에 추가" 를
// 누른 사건만 keptEvent 로 저장된다 (T6 UserMemory 구조 그대로).
//
// EventItem / SongCard 컴포넌트 파일은 보존 (SongCard 는 AssistantPanel
// 에서 음악 답에 재사용).

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
// 함께 갱신.
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

  // 저장된 keptEvents → title 까지 함께 가져와 화면에 칩으로 보여줌.
  // (이전 MonthForm 은 사건 그리드에서 title 을 얻었지만, 사건 그리드를
  // 빼면서 title 을 별도로 join 해야 함.)
  // V3: 비서 저장 답변도 함께 로드. 두 호출은 독립이라 병렬.
  const [saved, savedAnswers] = await Promise.all([
    loadTimemachineMonth(userId, year, month),
    listAssistantAnswers(userId, year, month),
  ]);
  const savedEventTitles = saved.keptEvents.length
    ? await prisma.monthEvent.findMany({
        where: { id: { in: saved.keptEvents.map((k) => k.monthEventId) } },
        select: { id: true, title: true },
      })
    : [];
  const titleById = new Map(savedEventTitles.map((r) => [r.id, r.title]));

  const initial: MonthV2Initial = {
    monthStory: saved.monthStory,
    keptEvents: saved.keptEvents.map((k) => ({
      monthEventId: k.monthEventId,
      // 비정규화 fallback: MonthEvent 가 삭제된 경우(SetNull 전) "기억한 사건"
      title: titleById.get(k.monthEventId) ?? "기억한 사건",
      story: k.story,
    })),
  };

  // RSC → Client serialization: Date 는 ISO string 으로 평탄화.
  const initialSavedAnswers: InitialSavedAnswer[] = savedAnswers.map((s) => ({
    id: s.id,
    question: s.question,
    createdAtIso: s.createdAt.toISOString(),
    answer: {
      text: s.answer.text,
      source: s.answer.source,
      category: s.answer.category,
      citations: s.answer.citations,
      songs: s.answer.songs,
      events: s.answer.events,
      depth: s.answer.depth,
    },
  }));

  const userName = session.user.name ?? session.user.email ?? "회원";
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const atLatest = year * 12 + month >= LATEST_YEAR * 12 + LATEST_MONTH;
  const atEarliest = year * 12 + month <= EARLIEST_YEAR * 12 + EARLIEST_MONTH;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
          {year}년 {month}월
        </h1>
        <p className="mt-5 text-xl text-zinc-800 sm:text-2xl">
          <b>{userName}</b>님, 이 달은 어떤 달이었나요?
        </p>
      </header>

      <MonthV2
        year={year}
        month={month}
        initial={initial}
        initialSavedAnswers={initialSavedAnswers}
      />

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
