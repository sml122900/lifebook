import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getLifeEvents } from "@/lib/life-events";
import { getLifeQuestion } from "@/lib/life-record/questions";

import { DeleteButton } from "./DeleteButton";

// Phase L4 — 인생 이벤트 관리 페이지. 시간순 리스트 + 각 행 [수정] [삭제].
// 점 클릭은 L3 에서 월별 타임머신으로 가는 흐름을 유지하기 위해, 수정·
// 삭제 동선은 *별도 페이지* 로 분리. 어르신이 길을 잃지 않게.

export const metadata = {
  title: "이벤트 관리 — 인생 연혁",
};

function formatWhen(year: number, month: number | null, exact: boolean) {
  if (exact && month != null) return `${year}년 ${month}월`;
  if (exact) return `${year}년`;
  return `${year}년쯤`;
}

function categoryLabel(category: string | null): string {
  if (!category) return "기타";
  const q = getLifeQuestion(category as never);
  return q?.shortLabel ?? "기타";
}

export default async function LifeTimelineManagePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const events = await getLifeEvents(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-ink-soft">
          <Link href="/life-timeline" className="underline hover:text-ink">
            ← 인생 연혁으로
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          이벤트 관리
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          기록한 이벤트를 고치거나 지울 수 있어요.
        </p>
      </header>

      {events.length === 0 ? (
        <section className="rounded-md border-2 border-line bg-surface p-6 text-center">
          <p className="text-lg text-ink-soft">
            아직 기록한 이벤트가 없어요.
          </p>
          <Link
            href="/life-timeline/add"
            className="mt-4 inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            첫 이벤트 추가하기
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => {
            const exact = e.precision === "EXACT";
            const whenText = formatWhen(e.eventYear, e.eventMonth, exact);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    aria-hidden
                    className={
                      "mt-1.5 inline-block flex-shrink-0 rounded-full border-2 " +
                      (exact
                        ? "h-5 w-5 border-action bg-action"
                        : "h-4 w-4 border-amber-400 border-dashed bg-amber-100")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "text-base " +
                        (exact
                          ? "font-semibold text-amber-800"
                          : "text-ink-faint")
                      }
                    >
                      {whenText} · {categoryLabel(e.category)}
                    </p>
                    <p className="break-words text-xl font-bold text-ink">
                      {e.title}
                    </p>
                    {e.content && (
                      <p className="mt-1 line-clamp-2 break-words text-base text-ink-soft">
                        {e.content}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Link
                    href={`/life-timeline/${e.id}/edit`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-base font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    수정
                  </Link>
                  <DeleteButton
                    eventId={e.id}
                    eventLabel={`${whenText} ${e.title}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {events.length > 0 && (
        <div>
          <Link
            href="/life-timeline/add"
            className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 px-5 py-3 text-lg font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            + 이벤트 더 추가하기
          </Link>
        </div>
      )}
    </main>
  );
}
