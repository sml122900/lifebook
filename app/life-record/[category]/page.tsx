import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAnsweredCategories,
  getLifeEventForCategory,
} from "@/lib/life-events";
import {
  LIFE_CATEGORY_ORDER,
  LIFE_QUESTIONS,
  getLifeQuestion,
  nextUnansweredCategory,
} from "@/lib/life-record/questions";
import type { LifeCategory } from "@/lib/generated/prisma/enums";

import { CategoryForm } from "./CategoryForm";

// Phase L2 — 한 카테고리의 질문 화면.
//
// URL 의 [category] 가 enum 의 유효 값이 아니면 404. 그 외엔 폼 prefill
// (이미 답한 경우)과 함께 클라이언트 폼을 렌더한다. "다음" 카테고리도
// 서버에서 계산해 폼에 전달 — 폼이 redirect 목적지를 알도록.

function asLifeCategory(v: string): LifeCategory | null {
  return getLifeQuestion(v as LifeCategory) ? (v as LifeCategory) : null;
}

export default async function LifeRecordCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { category: rawCategory } = await params;
  const category = asLifeCategory(rawCategory);
  if (!category) {
    notFound();
  }
  const question = getLifeQuestion(category);
  if (!question) notFound();

  // 같은 사용자 진행 상태로 진행도·다음 카테고리 결정.
  const [existing, answered] = await Promise.all([
    getLifeEventForCategory(session.user.id, category),
    getAnsweredCategories(session.user.id),
  ]);

  // 인덱스에서의 1-based 순서.
  const stepIndex = LIFE_CATEGORY_ORDER.indexOf(category);
  const stepLabel = `${stepIndex + 1} / ${LIFE_CATEGORY_ORDER.length}`;

  // 다음 카테고리 = 이 카테고리 다음 미답.
  // 답한 셋에 현재 카테고리를 미리 더해 "이번을 답한다고 가정"하고 계산
  // (저장에 성공하든 건너뛰든 동일한 다음 단계로 흐르게).
  const futureAnswered = new Set(answered);
  futureAnswered.add(category);
  const next = nextUnansweredCategory(futureAnswered);
  // 완료면 /life-record/complete 로, 아니면 /life-record/[next] 로 이동.
  const nextHref = next === null ? "/life-record/complete" : `/life-record/${next}`;

  // 인덱스로 돌아가는 링크도 폼에서 노출. (시니어가 길을 잃지 않게)
  const backHref = "/life-record";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base font-semibold text-amber-700">
          {stepLabel} · {question.shortLabel}
          {question.optional && (
            <span className="ml-2 font-medium text-zinc-500">(선택)</span>
          )}
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-4xl">
          {question.prompt}
        </h1>
        <p className="mt-3 text-lg text-zinc-700">{question.hint}</p>
      </header>

      <CategoryForm
        category={category}
        question={question}
        initial={
          existing
            ? {
                title: existing.eventTitle,
                year: existing.eventYear,
                month: existing.eventMonth,
                content: existing.content ?? "",
              }
            : null
        }
        nextHref={nextHref}
        backHref={backHref}
      />
    </main>
  );
}

// 메타데이터에 동적 카테고리 라벨.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const q = LIFE_QUESTIONS.find((x) => x.category === category);
  return {
    title: q ? `${q.shortLabel} — 인생 기록하기` : "인생 기록하기",
  };
}
