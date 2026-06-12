import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listAssistantAnswers } from "@/lib/timemachine-assistant-saved";
import { loadTimemachineMonth } from "@/lib/timemachine-memories";
import { getFilledMonthKeys, monthKey } from "@/lib/timemachine-progress";

import type { InitialSavedAnswer } from "./AssistantPanel";
import { MonthV2, type MonthV2Initial } from "./MonthV2";

// Lifebook v3 — 월 화면 비활성화 (2026-06-06).
//
// 핵심 통찰: 사용자는 사건의 *순서* 는 기억해도 정확한 *월* 은 기억 못 한다.
// 매달 빈 칸을 채우라는 부담은 v3 인생 연혁(/life-timeline)으로 대체.
// 이 라우트는 메인으로 redirect 한다 — 직접 URL·옛 북마크·외부 링크 모두
// 안전하게 흡수.
//
// 코드 보존 정책 (사용자 명시):
//   - 아래 _TimemachineMonthPageArchived 함수, 의존 컴포넌트(MonthV2/
//     MonthForm/MonthStory/EventItem/SongCard), 시드 데이터(MonthEvent/
//     ChartSong) 모두 그대로 유지.
//   - 시대 사건/음악 DB 는 AI 비서가 여전히 참조 (시드 활용 유지).
//   - 부활 시: default export 만 archived 함수로 교체하면 복구 끝.
//
// 비서는 영향 0 — AssistantModal 의 (fallbackYear, fallbackMonth) 컨텍스트
// 는 life_event 기반으로 이미 동작하고, 시드 사건/음악 DB 도 그대로.

export default function TimemachineMonthPage() {
  redirect("/life-timeline");
}

// ─────────────────────────────────────────────────────────────────────────
// 아래는 v2 월 화면(MonthV2 + 비서) 의 원본 진입점. 사용 0 — default export
// 가 위 redirect 로 교체됨. import 들이 unused 가 되지 않도록 함수 본문은
// 그대로 두며, 향후 부활 시 export default 를 이 함수로 다시 가리키면 됨.
// ─────────────────────────────────────────────────────────────────────────

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

// 동기부여 ① — 이미 채운 달에만 붙는 긍정 배지. 빈 달엔 아무 표시 안 함
// (죄책감 유발 금지). amber 톤은 어두운/밝은 버튼 양쪽에서 읽힘.
function FilledBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
      기록 있음
    </span>
  );
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

async function _TimemachineMonthPageArchived({ params }: PageProps) {
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
  // V3: 비서 저장 답변도 함께 로드. 세 호출은 독립이라 병렬.
  // filledKeys: 이전/다음 달이 채운 달인지 배지로 표시 (동기부여 ①).
  const [saved, savedAnswers, filledKeys] = await Promise.all([
    loadTimemachineMonth(userId, year, month),
    listAssistantAnswers(userId, year, month),
    getFilledMonthKeys(userId),
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
  const prevFilled = filledKeys.has(monthKey(prev.year, prev.month));
  const nextFilled = filledKeys.has(monthKey(next.year, next.month));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-5xl font-bold tracking-tight text-ink sm:text-6xl">
          {year}년 {month}월
        </h1>
        <p className="mt-5 text-xl text-ink sm:text-2xl">
          <b>{userName}</b>님, 이 달은 어떤 달이었나요?
        </p>
      </header>

      <MonthV2
        year={year}
        month={month}
        initial={initial}
        initialSavedAnswers={initialSavedAnswers}
      />

      <nav className="flex flex-col gap-3 border-t-2 border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        {!atEarliest ? (
          <Link
            href={`/timemachine/${prev.year}/${prev.month}`}
            prefetch
            className="inline-flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md bg-action px-8 py-4 text-xl font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <span>← {prev.year}년 {prev.month}월 보기</span>
            {prevFilled && <FilledBadge />}
          </Link>
        ) : (
          <p className="text-base text-ink-soft">
            여기가 가장 오래된 달이에요.
          </p>
        )}
        {!atLatest && (
          <Link
            href={`/timemachine/${next.year}/${next.month}`}
            prefetch
            className="inline-flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border-2 border-line px-8 py-4 text-xl font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <span>{next.year}년 {next.month}월 보기 →</span>
            {nextFilled && <FilledBadge />}
          </Link>
        )}
      </nav>
    </main>
  );
}

// 보존된 함수에 대한 unused-vars 경고 억제. archived 함수 자체와 그 안에서
// 만 쓰는 헬퍼·상수가 default export 에서 빠지면서 unused 가 됨.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __preserve_archived_exports = {
  _TimemachineMonthPageArchived,
  prevMonth,
  nextMonth,
  FilledBadge,
  LATEST_YEAR,
  LATEST_MONTH,
  EARLIEST_YEAR,
  EARLIEST_MONTH,
};
