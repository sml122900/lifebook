"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { SongCard } from "./SongCard";

// Phase V2 — AI 비서 패널.
//
// /api/timemachine/assistant 에 (question, year, month) 를 보내고, 답을
// 영역에 표시한다. DB 답이면 SongCard / "내 타임라인에 추가" 버튼 같이
// 렌더. 검색 답이면 출처와 차감 안내.
//
// "내 타임라인에 추가" 는 부모(MonthV2) 에 keptEvent 추가를 알리고,
// 부모가 client state 로 들고 있다가 "이 달 저장하기" 시 함께 보낸다.

const SUGGESTED_QUESTIONS: string[] = [
  "이때 나라가 떠들썩했던 일은?",
  "이때 유행한 노래는?",
  "그때 인기 드라마·영화는?",
  "그 시절 유행은?",
  "그때 물가나 살림은?",
];

type Citation = { url: string; title: string };

type AssistantEvent = {
  id: string;
  title: string;
  description: string;
  section: string;
};

type AssistantSong = {
  rank: number | null;
  title: string;
  artist: string;
  eraColor: string | null;
};

type AssistantResponse = {
  text: string;
  source: "db" | "web";
  category: "MUSIC" | "BIG" | "TASTE";
  citations: Citation[];
  tokensSpent: number;
  balanceAfter: number;
  events: AssistantEvent[];
  songs: AssistantSong[];
};

export type KeptEventInput = { monthEventId: string; title: string };

export function AssistantPanel({
  year,
  month,
  keptEventIds,
  onAddEvent,
}: {
  year: number;
  month: number;
  keptEventIds: Set<string>;
  onAddEvent: (k: KeptEventInput) => void;
}) {
  const [inputText, setInputText] = useState("");
  const [answer, setAnswer] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [isPending, startTransition] = useTransition();

  function ask(question: string) {
    const q = question.trim();
    if (q === "") return;
    setError(null);
    setInsufficient(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/timemachine/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, year, month }),
        });
        if (res.status === 402) {
          setInsufficient(true);
          setError("토큰이 부족해요.");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setError(body.message ?? "답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
          return;
        }
        const data = (await res.json()) as AssistantResponse;
        setAnswer(data);
      } catch (err) {
        console.error("[assistant-ask]", err);
        setError("답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <aside className="flex flex-col gap-5 rounded-md border-2 border-violet-200 bg-violet-50 p-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
          비서에게 물어보기
        </h2>
        <p className="mt-2 text-base text-zinc-700 sm:text-lg">
          {year}년 {month}월에 대해 궁금한 걸 골라 보세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            disabled={isPending}
            className="min-h-[52px] rounded-full border-2 border-violet-400 bg-white px-5 py-2 text-base font-semibold text-violet-900 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isPending) {
              e.preventDefault();
              ask(inputText);
              setInputText("");
            }
          }}
          placeholder="직접 물어보기"
          aria-label="비서에게 직접 묻는 질문"
          disabled={isPending}
          className="min-h-[52px] flex-1 rounded-md border-2 border-violet-300 bg-white px-4 py-3 text-lg text-zinc-900 focus:border-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => {
            ask(inputText);
            setInputText("");
          }}
          disabled={isPending || inputText.trim() === ""}
          className="min-h-[52px] rounded-md bg-violet-700 px-6 py-3 text-lg font-semibold text-white hover:bg-violet-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "찾는 중…" : "물어보기"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <p className="text-base text-rose-700" role="alert">
            {error}
            {insufficient && (
              <>
                {" "}
                <Link href="/billing" className="font-semibold underline">
                  충전하러 가기
                </Link>
              </>
            )}
          </p>
        )}

        {answer && !error && (
          <AnswerBlock
            answer={answer}
            keptEventIds={keptEventIds}
            onAddEvent={onAddEvent}
          />
        )}
      </div>
    </aside>
  );
}

function AnswerBlock({
  answer,
  keptEventIds,
  onAddEvent,
}: {
  answer: AssistantResponse;
  keptEventIds: Set<string>;
  onAddEvent: (k: KeptEventInput) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border-2 border-violet-300 bg-white p-5">
      <p className="whitespace-pre-line text-lg leading-relaxed text-zinc-900">
        {answer.text}
      </p>

      {/* MUSIC / DB → 곡 카드 (T5 SongCard 재사용) */}
      {answer.source === "db" && answer.songs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {answer.songs.map((s, i) => (
            <SongCard
              key={`${s.title}-${s.artist}-${i}`}
              rank={s.rank}
              title={s.title}
              artist={s.artist}
              eraColor={s.eraColor}
            />
          ))}
        </ul>
      )}

      {/* BIG / DB → 사건마다 "내 타임라인에 추가" 버튼 */}
      {answer.source === "db" && answer.events.length > 0 && (
        <ul className="flex flex-col gap-2">
          {answer.events.map((e) => {
            const already = keptEventIds.has(e.id);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-2 rounded-md border-2 border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-zinc-900">
                    {e.title}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-base text-zinc-700">
                      {e.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAddEvent({ monthEventId: e.id, title: e.title })}
                  disabled={already}
                  className="shrink-0 rounded-md border-2 border-amber-500 bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-600"
                >
                  {already ? "타임라인에 있음" : "내 타임라인에 추가"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 검색 답 → 출처 */}
      {answer.source === "web" && answer.citations.length > 0 && (
        <div className="border-t-2 border-zinc-200 pt-3">
          <p className="mb-2 text-base font-semibold text-zinc-800">출처</p>
          <ul className="flex flex-col gap-1">
            {answer.citations.slice(0, 6).map((c) => (
              <li key={c.url} className="text-sm">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-800 underline hover:text-violet-900"
                >
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 차감 안내 */}
      <p className="text-sm text-zinc-600">
        {answer.tokensSpent === 0
          ? "검증된 자료라 토큰을 쓰지 않았어요."
          : `토큰 ${answer.tokensSpent}개 사용 · 남은 ${answer.balanceAfter.toLocaleString()}개`}
      </p>
    </div>
  );
}
