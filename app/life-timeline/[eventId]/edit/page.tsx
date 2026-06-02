import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getLifeEventById } from "@/lib/life-events";

import { EventForm } from "../../EventForm";

// Phase L4 — 인생 이벤트 수정 페이지. 권한 확인은 헬퍼(getLifeEventById)
// 가 userId 일치만 통과시키므로, 결과가 null 이면 자동 404.

export const metadata = {
  title: "이벤트 수정 — 인생 연혁",
};

export default async function LifeTimelineEditPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { eventId } = await params;
  const event = await getLifeEventById(session.user.id, eventId);
  if (!event) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-zinc-600">
          <Link
            href="/life-timeline/manage"
            className="underline hover:text-zinc-900"
          >
            ← 이벤트 관리
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          이벤트 수정
        </h1>
      </header>

      <EventForm
        mode="edit"
        initial={{
          eventId: event.id,
          category: event.category,
          precision: event.precision,
          title: event.eventTitle,
          year: event.eventYear,
          month: event.eventMonth,
          content: event.content ?? "",
        }}
      />
    </main>
  );
}
