import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getLifeEvents } from "@/lib/life-events";

import { EventForm, type AnchorOption } from "../EventForm";

// Phase L4 — 인생의 한 장면 추가하기.
//
// 두 모드 폼(EventForm) 호스트. 사용자의 기존 이벤트를 모아 "앵커 사이"
// 모드의 select 옵션으로 전달.

export const metadata = {
  title: "인생의 한 장면 추가 — 인생 연혁",
};

export default async function LifeTimelineAddPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const events = await getLifeEvents(session.user.id);

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

      <EventForm mode="add" anchors={anchors} />
    </main>
  );
}
