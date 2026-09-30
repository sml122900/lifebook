"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import type { SearchResult } from "@/lib/lab/search";

import { searchCardsAction } from "../actions";

const toYear = (s: string) =>
  /^\d{4}$/.test(s.trim()) ? Number(s.trim()) : undefined;

export function SearchPanel({
  subjects,
}: {
  subjects: { id: string; label: string }[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [useHint, setUseHint] = useState(true);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        setResult(
          await searchCardsAction(subjectId, {
            query,
            yearFrom: toYear(yearFrom),
            yearTo: toYear(yearTo),
            useQuestionTimeHint: useHint,
            limit: 10,
          }),
        );
      } catch {
        setError("검색하지 못했어요.");
      }
    });

  const field =
    "min-h-[48px] rounded-[10px] border border-line bg-surface px-3 text-ink";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-ink-soft">
          대상
          <select
            className={field}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-ink-soft">
          질문
          <input
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                query.trim()
              )
                run();
            }}
            placeholder="예: 군대 있을 때 무슨 노래를 불렀지?"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-ink-soft">
          연도부터(필터)
          <input
            className={field}
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-ink-soft">
          연도까지(필터)
          <input
            className={field}
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-ink-soft">
        <input
          type="checkbox"
          checked={useHint}
          onChange={(e) => setUseHint(e.target.checked)}
        />
        질문 속 시기 표현을 가산점으로(필터 아님)
      </label>
      <div>
        <Button onClick={run} disabled={pending || !query.trim() || !subjectId}>
          {pending ? "검색 중…" : "검색"}
        </Button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {result && (
        <div>
          <p className="text-ink-soft">
            후보 {result.candidates}장 · 벡터{" "}
            {result.vectorUsed ? "사용" : "미사용"} · 시기 힌트{" "}
            {result.timeHint
              ? `${result.timeHint.yearFrom}~${result.timeHint.yearTo}`
              : "없음"}{" "}
            · 원본 소멸로 제외 {result.droppedDeadSource} · 인물 소멸로 제외{" "}
            {result.droppedDeadPerson}
          </p>
          <ol className="mt-3 flex flex-col gap-3">
            {result.hits.map((h, i) => (
              <li
                key={h.cardId}
                className="rounded-md border border-line bg-surface p-3"
              >
                <p className="text-ink">
                  {i + 1}. {h.summary}
                </p>
                {h.quote && (
                  <p className="mt-1 text-ink-soft">인용: “{h.quote}”</p>
                )}
                <p className="mt-1 font-mono text-base text-ink-soft">
                  {h.sourceType} · {h.kind} · 시기{" "}
                  {h.when.from === null
                    ? "미상"
                    : h.when.from === h.when.to
                      ? h.when.from
                      : `${h.when.from}~${h.when.to}`}
                  ({h.when.basis}) · 인물{" "}
                  {h.people.map((p) => p.name).join(", ") || "-"} · 벡터{" "}
                  {h.scores.vector ?? "-"} · 키워드 {h.scores.keyword} · 최종{" "}
                  {h.scores.final}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
