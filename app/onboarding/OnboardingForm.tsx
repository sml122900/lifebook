"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { QUESTIONS, type Question } from "@/lib/onboarding/questions";

import { saveOnboarding } from "./actions";

type Answers = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function OnboardingForm() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState<unknown>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const current = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;
  const progress = ((index + 1) / QUESTIONS.length) * 100;

  async function commit(next: unknown) {
    const nextAnswers = { ...answers };
    if (!isEmpty(next)) {
      nextAnswers[current.key] = next;
    }
    if (isLast) {
      setSubmitting(true);
      try {
        await saveOnboarding(nextAnswers);
      } finally {
        router.push("/timeline");
      }
      return;
    }
    setAnswers(nextAnswers);
    setDraft(undefined);
    setIndex(index + 1);
  }

  function skip() {
    void commit(undefined);
  }

  function next() {
    void commit(draft);
  }

  return (
    <div className="flex flex-col gap-8">
      <ProgressBar index={index} total={QUESTIONS.length} progress={progress} />

      <section className="rounded-md border-2 border-zinc-200 bg-white p-6">
        <p className="text-xl font-semibold text-zinc-900">{current.prompt}</p>
        <QuestionHint question={current} />
        <div className="mt-6">
          <QuestionInput question={current} value={draft} onChange={setDraft} />
        </div>
      </section>

      <div className="flex justify-between gap-4">
        <button
          type="button"
          onClick={skip}
          disabled={submitting}
          className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          건너뛰기
        </button>
        <button
          type="button"
          onClick={next}
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          {submitting ? "저장 중..." : isLast ? "완료" : "다음"}
        </button>
      </div>
    </div>
  );
}

function ProgressBar({
  index,
  total,
  progress,
}: {
  index: number;
  total: number;
  progress: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-base text-zinc-700">
        <span>
          {index + 1} / {total}
        </span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full bg-zinc-900 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function QuestionHint({ question }: { question: Question }) {
  const hint = "hint" in question ? question.hint : undefined;
  const nicknameHint =
    "nicknameHint" in question ? question.nicknameHint : false;
  return (
    <>
      {hint && <p className="mt-2 text-base text-zinc-600">{hint}</p>}
      {nicknameHint && (
        <p className="mt-2 text-base text-zinc-600">
          실명 대신 별명이나 이니셜로 적어도 좋아요.
        </p>
      )}
    </>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (question.kind) {
    case "year":
      return <YearInput value={value as number | undefined} onChange={onChange} />;
    case "chips":
      return (
        <ChipsInput
          value={(value as string[] | undefined) ?? []}
          options={question.options}
          onChange={onChange}
        />
      );
    case "textlist":
    case "tags":
      return (
        <TextListInput
          value={(value as string[] | undefined) ?? []}
          onChange={onChange}
        />
      );
    case "text":
      return <TextInput value={(value as string | undefined) ?? ""} onChange={onChange} />;
  }
}

function YearInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1900}
      max={new Date().getFullYear()}
      placeholder="예: 1965"
      value={value ?? ""}
      onChange={(e) => {
        const n = e.target.value === "" ? undefined : Number(e.target.value);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
      className="w-full rounded-md border-2 border-zinc-300 px-4 py-3 text-xl focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
    />
  );
}

function ChipsInput({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={on}
            className={
              "rounded-full border-2 px-5 py-3 text-lg font-medium focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 " +
              (on
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100")
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function TextListInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-col gap-2">
          {value.map((v, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md border-2 border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <span className="text-lg text-zinc-900">{v}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`${v} 삭제`}
                className="text-base text-zinc-700 underline hover:text-zinc-900"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="입력 후 Enter 또는 추가 버튼"
          className="flex-1 rounded-md border-2 border-zinc-300 px-4 py-3 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border-2 border-zinc-300 px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          추가
        </button>
      </div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-md border-2 border-zinc-300 px-4 py-3 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
    />
  );
}
