"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import type { LifeQuestion } from "@/lib/life-record/questions";
import type { LifeCategory } from "@/lib/generated/prisma/enums";

import { submitLifeRecord } from "../actions";

// Phase L2 — 카테고리 폼(클라). 한 카테고리에 대해 제목·연·월·자유 응답
// 을 한 화면에 모아 받는다. "저장하고 다음" / "건너뛰기" / "전체 목록".
//
// 시니어 친화:
//   - 큰 라벨, 큰 입력 박스 (text-xl, py-3)
//   - 명확한 에러 ("연도를 적어주세요" 등 무엇을 하면 되는지)
//   - 음성 입력은 자유 응답에만 (제목·연도는 짧아 키보드가 더 빠름)
//
// "건너뛰기" 는 저장 호출 없이 다음 카테고리로 이동만. 다음에 다시 들어
// 오면 답한 카테고리는 prefill (수정 폼), 미답은 다시 빈 폼.

type InitialAnswer = {
  title: string;
  year: number;
  month: number | null;
  content: string;
} | null;

export function CategoryForm({
  category,
  question,
  initial,
  nextHref,
  backHref,
}: {
  category: LifeCategory;
  question: LifeQuestion;
  initial: InitialAnswer;
  nextHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [yearText, setYearText] = useState(
    initial?.year != null ? String(initial.year) : "",
  );
  const [monthText, setMonthText] = useState(
    initial?.month != null ? String(initial.month) : "",
  );
  const [content, setContent] = useState(initial?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasExisting = initial !== null;

  function parseIntOrNull(t: string): number | null {
    const trimmed = t.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return null;
    return n;
  }

  function handleSave() {
    setError(null);
    const year = parseIntOrNull(yearText);
    const month = parseIntOrNull(monthText);
    startTransition(async () => {
      const result = await submitLifeRecord(category, {
        title,
        year,
        month,
        content: content.trim() === "" ? null : content,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(nextHref);
      router.refresh();
    });
  }

  function handleSkip() {
    // 저장 호출 없이 다음 카테고리로. 사용자가 답하기 싫거나 모르는 경우.
    router.push(nextHref);
  }

  return (
    <div className="flex flex-col gap-6">
      {hasExisting && (
        <div
          className="rounded-md border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-base text-emerald-900"
          role="status"
        >
          이미 답하신 항목이에요. 수정하시려면 아래를 고친 뒤 저장해 주세요.
        </div>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="life-title" className="text-lg font-semibold text-zinc-900">
          {question.titleLabel}
        </label>
        <input
          id="life-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={question.titlePlaceholder}
          maxLength={80}
          className="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          autoComplete="off"
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-zinc-900">언제였어요?</p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="life-year"
              className="block text-base text-zinc-700"
            >
              연도
            </label>
            <input
              id="life-year"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={yearText}
              onChange={(e) => setYearText(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="예: 1985"
              className="mt-1 w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            />
          </div>
          <div className="w-32">
            <label
              htmlFor="life-month"
              className="block text-base text-zinc-700"
            >
              월 (선택)
            </label>
            <input
              id="life-month"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={monthText}
              onChange={(e) => setMonthText(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="3"
              className="mt-1 w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            />
          </div>
        </div>
        <p className="text-base text-zinc-600">
          정확한 달이 안 떠오르시면 비워두셔도 돼요.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label
          htmlFor="life-content"
          className="text-lg font-semibold text-zinc-900"
        >
          {question.contentLabel} <span className="text-zinc-500">(선택)</span>
        </label>
        <VoiceTextarea
          value={content}
          onChange={setContent}
          rows={5}
          placeholder={question.contentPlaceholder}
          ariaLabel={question.contentLabel}
        />
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref}
          className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          ← 전체 목록
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 px-6 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-zinc-900 px-6 py-3 text-lg font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            {isPending ? "저장 중…" : "저장하고 다음 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
