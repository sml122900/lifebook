import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAnsweredCategories } from "@/lib/life-events";
import { LIFE_QUESTIONS } from "@/lib/life-record/questions";

// Phase L2 — 인생 기록 완료 화면.
//
// 모든 카테고리에 답한 경우든, 일부만 답하고 도달한 경우든 같은 화면을
// 보여준다 — "여기까지 채우셨어요" + "인생 연혁 보러 가기".
// L3 가 만들어지면 /timemachine 안에 연혁이 자리 잡으므로, 일단 그쪽으로
// 보낸다 (메인 페이지가 곧 연혁이 될 것이므로 동선이 자연스럽다).

export default async function LifeRecordCompletePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const answered = await getAnsweredCategories(session.user.id);
  const doneCount = answered.size;
  const totalCount = LIFE_QUESTIONS.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="text-center">
        <p className="text-6xl" aria-hidden>
          🌿
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          여기까지 채우셨어요
        </h1>
        <p className="mt-4 text-xl text-ink sm:text-2xl">
          {doneCount === totalCount
            ? "인생 골격이 모두 잡혔어요."
            : `${totalCount}개 중 ${doneCount}개의 큰 줄기를 잡으셨어요.`}
        </p>
        <p className="mt-2 text-lg text-ink-soft">
          나머지는 언제든 천천히 채우셔도 돼요.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <Link
          href="/timemachine"
          prefetch
          className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-action px-8 py-4 text-2xl font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          내 인생 연혁 보러 가기 →
        </Link>
        {doneCount < totalCount && (
          <Link
            href="/life-record"
            className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-line px-6 py-3 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            남은 항목 더 채우기
          </Link>
        )}
      </div>
    </main>
  );
}
