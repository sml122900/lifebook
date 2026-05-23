"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phase 4.1 temporary inline questions. Phase 4.2 will move these into
// lib/onboarding/questions.ts and expand the script.
type Question =
  | { id: string; kind: "year"; key: "birthYear"; prompt: string }
  | {
      id: string;
      kind: "chips";
      key: "interests";
      prompt: string;
      options: string[];
      multi: true;
    };

const QUESTIONS: Question[] = [
  { id: "q1", kind: "year", key: "birthYear", prompt: "태어난 연도를 알려주세요." },
  {
    id: "q2",
    kind: "chips",
    key: "interests",
    prompt: "관심 있는 분야를 모두 골라주세요.",
    options: ["영화", "드라마/예능", "음악", "게임", "스포츠", "시사/뉴스", "기술/IT"],
    multi: true,
  },
];

type Answers = Record<string, unknown>;

export function OnboardingForm() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState<unknown>(undefined);

  const current = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;
  const progress = ((index + 1) / QUESTIONS.length) * 100;

  function commit(next: unknown) {
    const nextAnswers = { ...answers };
    if (next !== undefined && next !== "" && !(Array.isArray(next) && next.length === 0)) {
      nextAnswers[current.key] = next;
    }
    if (isLast) {
      // Phase 4.3 will persist nextAnswers via a server action before navigating.
      router.push("/timeline");
      return;
    }
    setAnswers(nextAnswers);
    setDraft(undefined);
    setIndex(index + 1);
  }

  function skip() {
    commit(undefined);
  }

  function next() {
    commit(draft);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-base text-zinc-700">
          <span>
            {index + 1} / {QUESTIONS.length}
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

      <section className="rounded-md border-2 border-zinc-200 bg-white p-6">
        <p className="text-xl font-semibold text-zinc-900">{current.prompt}</p>
        <div className="mt-6">
          {current.kind === "year" && (
            <YearInput value={draft as number | undefined} onChange={setDraft} />
          )}
          {current.kind === "chips" && (
            <ChipsInput
              value={(draft as string[] | undefined) ?? []}
              options={current.options}
              onChange={setDraft}
            />
          )}
        </div>
      </section>

      <div className="flex justify-between gap-4">
        <button
          type="button"
          onClick={skip}
          className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          건너뛰기
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          {isLast ? "완료" : "다음"}
        </button>
      </div>
    </div>
  );
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
