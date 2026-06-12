"use client";

import { useState, useTransition } from "react";

import { QUESTIONS, type Question } from "@/lib/onboarding/questions";

import { saveProfile } from "./actions";

export type ProfileInitial = {
  birthYear: number | null;
  interests: string[];
  residences: string[];
  schools: string[];
  favMovies: string[];
  favGames: string[];
  favMusic: string[];
  siblings: string;
  parentsInfo: string;
  closeFriends: string;
  hobbies: string;
};

type Values = ProfileInitial;

// 한 화면에서 모든 온보딩 질문을 편집. 저장은 한 번에 upsert.
// 입력 컨트롤은 OnboardingForm의 wizard와는 별개로 자체 유지 (단계 없음).
export function ProfileEditForm({ initial }: { initial: ProfileInitial }) {
  const [values, setValues] = useState<Values>(initial);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof Values>(key: K, v: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setSavedAt(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await saveProfile(values);
        setSavedAt(new Date());
      } catch (err) {
        console.error("[profile-save]", err);
        setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {QUESTIONS.map((q) => (
        <section
          key={q.id}
          className="rounded-md border-2 border-line bg-surface p-5"
        >
          <p className="text-lg font-semibold text-ink">{q.prompt}</p>
          <QuestionHint question={q} />
          <div className="mt-4">
            <FieldFor question={q} values={values} update={update} />
          </div>
        </section>
      ))}

      {error && (
        <p className="text-base text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        {savedAt && (
          <p className="text-base text-emerald-700">
            저장됨 · {savedAt.toLocaleTimeString("ko-KR")}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="ml-auto min-h-[60px] rounded-md bg-action px-6 py-4 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function QuestionHint({ question }: { question: Question }) {
  const hint = "hint" in question ? question.hint : undefined;
  const nicknameHint =
    "nicknameHint" in question ? question.nicknameHint : false;
  return (
    <>
      {hint && <p className="mt-2 text-base text-ink-soft">{hint}</p>}
      {nicknameHint && (
        <p className="mt-2 text-base text-ink-soft">
          실명 대신 별명이나 이니셜로 적어도 좋아요.
        </p>
      )}
    </>
  );
}

type UpdateFn = <K extends keyof Values>(key: K, v: Values[K]) => void;

function FieldFor({
  question,
  values,
  update,
}: {
  question: Question;
  values: Values;
  update: UpdateFn;
}) {
  switch (question.kind) {
    case "year":
      return (
        <YearInput
          value={values.birthYear}
          onChange={(v) => update("birthYear", v)}
        />
      );
    case "chips":
      return (
        <ChipsInput
          value={values[question.key]}
          options={question.options}
          onChange={(v) => update(question.key, v)}
        />
      );
    case "textlist":
    case "tags":
      return (
        <TextListInput
          value={values[question.key]}
          onChange={(v) => update(question.key, v)}
        />
      );
    case "text":
      return (
        <TextInput
          value={values[question.key]}
          onChange={(v) => update(question.key, v)}
        />
      );
  }
}

function YearInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
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
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : null);
      }}
      className="w-full rounded-md border-2 border-line px-4 py-3 text-xl focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
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
              "rounded-full border-2 px-5 py-3 text-base font-medium focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
              (on
                ? "border-brand bg-banner text-action"
                : "border-line bg-surface text-ink-soft hover:bg-banner")
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
              className="flex items-center justify-between rounded-md border-2 border-line bg-canvas px-4 py-3"
            >
              <span className="text-base text-ink">{v}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`${v} 삭제`}
                className="text-base text-ink-soft underline hover:text-ink"
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
          placeholder="쓰고 나서 '추가'를 눌러주세요"
          className="flex-1 rounded-md border-2 border-line px-4 py-3 text-base focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border-2 border-line px-5 py-3 text-base font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
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
      className="w-full rounded-md border-2 border-line px-4 py-3 text-base focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
    />
  );
}
