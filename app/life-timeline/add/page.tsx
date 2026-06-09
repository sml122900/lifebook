import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";

import { type AnchorOption } from "../EventForm";
import { NewEventForm } from "./NewEventForm";

// Phase L4 — 인생의 한 장면 추가하기.
//
// 두 모드 폼(EventForm) 호스트. 사용자의 기존 이벤트를 모아 "앵커 사이"
// 모드의 select 옵션으로 전달.
//
// v3.3 — 연혁 세로선 빈 공간 클릭 또는 점 옆 + 버튼으로 진입하면
// ?year=YYYY (선택: &hint=1) 를 받아 폼의 연도를 미리 채워준다. 사용자는
// 제목만 입력하면 됨. hint=1 이면 "연도는 바꾸실 수 있어요" 안내 한 줄.

export const metadata = {
  title: "인생의 한 장면 추가 — 인생 연혁",
};

const YEAR_MIN = 1900;

function parseDefaultYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return null;
  const yearMax = new Date().getFullYear() + 1;
  if (n < YEAR_MIN || n > yearMax) return null;
  return n;
}

export default async function LifeTimelineAddPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; hint?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const defaultYear = parseDefaultYear(params.year);
  const showHint = params.hint === "1" && defaultYear !== null;

  const [events, birthYear] = await Promise.all([
    getLifeEvents(session.user.id),
    getBirthYear(session.user.id),
  ]);

  // 앵커 후보 = 기존 이벤트 전부(EXACT/APPROXIMATE 무관 — "이후/이전" 순서
  // 정의에는 정확도가 상관 없다). 시간순(timeKey)로 정렬돼 들어옴.
  const anchors: AnchorOption[] = events.map((e) => {
    const whenText =
      e.eventMonth != null
        ? `${e.eventYear}년 ${e.eventMonth}월`
        : `${e.eventYear}년쯤`;
    return {
      id: e.id,
      label: `${whenText} — ${e.title}`,
      sortKey:
        e.eventMonth != null
          ? e.eventYear + (e.eventMonth - 1) / 12
          : e.eventYear + 0.5,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-zinc-600">
          <Link href="/life-timeline" className="underline hover:text-zinc-900">
            ← 인생 연혁으로
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          인생의 한 장면 추가하기
        </h1>
        <p className="mt-3 text-lg text-zinc-700">
          정확한 시점이 안 떠올라도 괜찮아요. 두 사건 사이에 있던 일이라면
          그것만 골라주셔도 됩니다.
        </p>
      </header>

      {showHint && (
        <aside
          role="note"
          className="rounded-md border-2 border-amber-200 bg-amber-50 px-5 py-4 text-base text-amber-900"
        >
          <b>{defaultYear}년쯤</b>의 이야기를 추가해보세요. 연도는 바꾸실 수
          있어요.
        </aside>
      )}

      <NewEventForm
        anchors={anchors}
        birthYear={birthYear}
        defaultYear={defaultYear}
      />
    </main>
  );
}
