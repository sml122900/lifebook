import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAnsweredCategories,
  getSkippedCategories,
} from "@/lib/life-events";
import {
  LIFE_QUESTIONS,
  nextUnansweredCategory,
} from "@/lib/life-record/questions";

// Phase L2 — 인생 기록 인덱스.
//   - 진행도 ("9개 중 N개 답하셨어요")
//   - 다음 미답 카테고리로 가는 큰 버튼
//   - 9개 카테고리 카드 (답함 ✓ / 미답) — 누르면 그 카테고리 폼으로
//   - 모두 답했으면 "완료" 화면으로 이어지는 버튼
//
// 시니어 친화 — 한 화면에 한 액션, 큰 버튼, 압박 없는 톤. 미답 카테고리도
// "아직 안 답하신 것" 정도로만 표시 (X 표시 같은 부정 시각 안 씀).
//
// L7 — /enter 가 완전 신규 사용자를 여기로 보낼 때 ?new=1 을 붙인다.
// 그 경우 상단에 짧은 환영 안내 한 줄. V3WelcomeBanner(/life-timeline 의
// 첫 방문 안내) 와 충돌 X — 그건 v2 기존 사용자용, 이건 완전 신규 도착용.
// 닫기는 ?new 없는 같은 경로로 이동 — 새 DB/localStorage 0, 서버만으로 종료.

export default async function LifeRecordIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const isNewArrival = params.new === "1";

  const [answered, skipped] = await Promise.all([
    getAnsweredCategories(session.user.id),
    getSkippedCategories(session.user.id),
  ]);
  const next = nextUnansweredCategory(answered, skipped);
  const totalCount = LIFE_QUESTIONS.length;
  const doneCount = answered.size;
  const skippedCount = skipped.size;
  // 처리율 (답함 + 건너뜀) — 진척 바·"이어서 하기" 분기에 사용.
  const processedCount = doneCount + skippedCount;
  const allDone = next === null;

  const userName = session.user.name ?? session.user.email ?? "회원";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      {isNewArrival && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border-2 border-brand bg-banner px-5 py-4"
        >
          <p className="flex-1 text-base text-action sm:text-lg">
            <b>Lifebook 에 오신 걸 환영해요.</b> 몇 가지 질문에 떠오르는 만큼만
            답하시면 인생 연혁이 그려져요. 답하기 어려운 건 건너뛰셔도 됩니다.
          </p>
          <Link
            href="/life-record"
            aria-label="안내 닫기"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border-2 border-brand text-xl font-bold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            ✕
          </Link>
        </div>
      )}

      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            인생 기록하기
          </h1>
          <p className="mt-4 text-xl text-ink sm:text-2xl">
            <b>{userName}</b>님의 인생 큰 줄기를 한 번 잡아볼까요?
          </p>
          <p className="mt-2 text-lg text-ink-soft">
            한 번에 한 가지씩, 떠오르는 만큼만 적으셔도 괜찮아요.
            답하기 어려운 건 건너뛰셔도 됩니다.
          </p>
        </div>
        <Link
          href="/people/new?returnTo=/life-record"
          className="self-start inline-flex min-h-[56px] items-center gap-2 rounded-md border-2 border-line bg-surface px-5 py-3 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          👤 인물 추가하기
        </Link>
      </header>

      <section className="rounded-md border-2 border-amber-300 bg-amber-50 p-6">
        <p className="text-lg font-semibold text-amber-900">
          {allDone
            ? "골격이 모두 채워졌어요!"
            : `${totalCount}개 중 ${doneCount}개 답하셨어요`}
          {skippedCount > 0 && !allDone && (
            <span className="ml-2 text-base font-medium text-amber-700">
              (건너뜀 {skippedCount}개)
            </span>
          )}
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${(processedCount / totalCount) * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-5">
          {allDone ? (
            <Link
              href="/life-record/complete"
              className="inline-flex min-h-[64px] items-center justify-center rounded-md bg-action px-8 py-4 text-xl font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              완료 화면으로 →
            </Link>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/life-record/${next}`}
                prefetch
                className="inline-flex min-h-[64px] items-center justify-center rounded-md bg-action px-8 py-4 text-xl font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                {processedCount === 0 ? "시작하기 →" : "이어서 하기 →"}
              </Link>
              {/* 3차(디자이너 확정) — 미완료 상태에도 완료 화면 진입로를
                  secondary 로. 0개 처리 상태에선 무의미해 숨김. */}
              {processedCount > 0 && (
                <Link
                  href="/life-record/complete"
                  className="inline-flex min-h-[64px] items-center justify-center rounded-[10px] border-2 border-brand bg-surface px-8 py-4 text-xl font-bold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  완료 화면으로 →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <section aria-label="카테고리 목록" className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-ink">전체 항목</h2>
        <p className="text-base text-ink-soft">
          원하는 항목을 직접 골라 적으셔도 돼요.
        </p>
        <ul className="flex flex-col gap-2">
          {LIFE_QUESTIONS.map((q, i) => {
            const done = answered.has(q.category);
            const isSkipped = !done && skipped.has(q.category);
            // 뱃지 시각: 답함(success-deep 강조) ≠ 건너뜀(zinc 담담) ≠ 아직(zinc
            // 같지만 "아직"문구). X 표시·rose 같은 부정 색 금지(기획 원칙).
            const badgeClass = done
              ? "bg-[#EAF2EA] text-success-deep"
              : isSkipped
                ? "bg-canvas text-ink-faint"
                : "bg-canvas text-ink-soft";
            const badgeText = done
              ? "✓ 답함"
              : isSkipped
                ? "건너뜀"
                : "아직";
            return (
              <li key={q.category}>
                <Link
                  href={`/life-record/${q.category}`}
                  className="flex items-center justify-between gap-4 rounded-md border-2 border-line bg-surface px-5 py-4 hover:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-base text-ink-soft">
                      {i + 1} / {totalCount}
                    </span>
                    <span className="text-xl font-bold text-ink">
                      {q.shortLabel}
                      {q.optional && (
                        <span className="ml-2 align-middle text-base font-medium text-ink-faint">
                          (선택)
                        </span>
                      )}
                    </span>
                  </div>
                  <span
                    className={
                      "rounded-full px-4 py-2 text-base font-semibold " +
                      badgeClass
                    }
                  >
                    {badgeText}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
