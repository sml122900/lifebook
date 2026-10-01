"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";

import {
  askAgentAction,
  listAgentRunsAction,
  type AskView,
  type RunListItem,
} from "../actions";

const usd = (micro: number) => `$${(micro / 1e6).toFixed(4)}`;

export function AskPanel({
  subjects,
}: {
  subjects: { id: string; label: string }[];
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskView | null>(null);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!subjectId) return;
    listAgentRunsAction(subjectId)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [subjectId]);

  const ask = () =>
    startTransition(async () => {
      setError(null);
      try {
        setResult(await askAgentAction(subjectId, question));
        setRuns(await listAgentRunsAction(subjectId));
      } catch {
        setError("답을 찾지 못했어요.");
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
            onChange={(e) => {
              setSubjectId(e.target.value);
              setResult(null);
            }}
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
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                question.trim() &&
                !pending
              )
                ask();
            }}
            placeholder="예: 군대 있을 때 친했던 사람이 누구였지?"
          />
        </label>
      </div>
      <div>
        <Button
          variant="primary"
          onClick={ask}
          disabled={pending || !question.trim() || !subjectId}
        >
          {pending ? "기억을 찾는 중…" : "물어보기"}
        </Button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {result && (
        <section className="rounded-md border border-line bg-surface p-4">
          <p className="text-lg leading-relaxed text-ink">{result.text}</p>
          {result.citations.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2">
              {result.citations.map((c) => (
                <li key={c.n} className="text-ink-soft">
                  <span className="font-semibold text-ink">[{c.n}]</span>{" "}
                  {c.summary}
                  {c.quote && <span className="block pl-6">“{c.quote}”</span>}
                  <span className="block pl-6 font-mono text-base">
                    {c.source}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 font-mono text-base text-ink-soft">
            라운드 {result.rounds} · 도구 {result.tools.join("→") || "-"} · 주장{" "}
            {result.stats.submittedClaims}(버림 {result.stats.droppedClaims},
            가짜 근거 {result.stats.droppedCitations}) · 후속 질문{" "}
            {result.stats.followUpRejected
              ? `버림(${result.stats.followUpRejected})`
              : "통과/없음"}{" "}
            · {usd(result.costMicroUsd)}
            {result.error ? ` · 오류: ${result.error}` : ""}
          </p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-ink">최근 답</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-ink-soft">아직 없어요.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {runs.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-line bg-surface p-3"
              >
                <p className="font-semibold text-ink">Q. {r.question}</p>
                <p className="mt-1 text-ink-soft">
                  {r.text ??
                    "[원본 삭제됨] 근거가 된 기록이 지워져 이 답은 비웠어요."}
                </p>
                <p className="mt-1 font-mono text-base text-ink-soft">
                  {new Date(r.createdAt).toLocaleString("ko-KR")} · 라운드{" "}
                  {r.rounds} · {usd(r.costMicroUsd)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
