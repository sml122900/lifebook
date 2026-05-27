"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { SongCard } from "./SongCard";
import {
  saveAssistantAnswerAction,
  deleteAssistantAnswerAction,
} from "./assistant-actions";

// Phase V2 — AI 비서 패널.
// Phase V3 — 멀티턴 대화 + 답변 저장/토글.
//
// 대화 모델:
//   - messages: 한 페이지(year/month) 안에서만 유지. 페이지 떠나면 잊음.
//     "이 화면 안에서만 맥락" 약속과 일치.
//   - ask() 는 messages 를 prior 로 그대로 보냄. 백엔드(clampPrior)가
//     최근 8턴 + 각 600자로 자름.
//
// 토글:
//   - "채팅" : 대화 thread + 칩 + 입력.
//   - "저장된 답변" : 저장된 답 목록. 토큰 0 으로 재렌더.
//
// 저장:
//   - 각 어시스턴트 답에 "저장" 버튼. 클릭 시 server action 호출 →
//     UserMemory(createdVia=timemachine_assistant) 행 생성.
//   - 한 번 저장된 답은 같은 채팅 화면에서 "저장됨" 으로 disabled.
//   - 저장된 답변 모드에서 "빼기" 가능 → 삭제 후 채팅 답에서 다시 저장 가능.

// 칩마다 보조 라벨로 출처 힌트를 미리 보여줌 — 사용자가 클릭 전에
// 무료(우리 자료)/유료(검색) 를 가늠할 수 있게.
// 주의: "우리 자료" 라벨은 시드된 달(2025.6~2026.5)에서만 정확.
// 시드 없는 달에선 검색 폴백이 되지만, 사용자의 보통 사용 패턴(최근 달)
// 에선 안내가 맞는 경우가 더 많아 "보통" 으로 표현.
const SUGGESTED_QUESTIONS: { text: string; hint: string }[] = [
  { text: "이때 나라가 떠들썩했던 일은?", hint: "보통 우리 자료" },
  { text: "이때 유행한 노래는?", hint: "보통 우리 자료" },
  { text: "그때 인기 드라마·영화는?", hint: "인터넷 검색" },
  { text: "그 시절 유행은?", hint: "인터넷 검색" },
  { text: "그때 물가나 살림은?", hint: "인터넷 검색" },
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

// V4 — 답의 깊이. 사용자에게 라벨로만 노출, 모델 이름 절대 X.
type AssistantDepth = "simple" | "detailed" | "precise";

type DepthInfo = {
  label: string;
  hint: string;          // "약 N토큰" — 검색 답 기준 추정
  estimateTokens: number;
};

// 추정값. 검색 답(=가장 비싼 경로) 기준. 실측: Haiku 평균 9~10 base.
// Sonnet 3x, Opus 5x 후 +1 web surcharge.
const DEPTH_OPTIONS: { key: AssistantDepth; info: DepthInfo }[] = [
  {
    key: "simple",
    info: { label: "간단히", hint: "약 10토큰", estimateTokens: 10 },
  },
  {
    key: "detailed",
    info: { label: "자세히", hint: "약 30토큰", estimateTokens: 30 },
  },
  {
    key: "precise",
    info: { label: "가장 정확하게", hint: "약 50토큰", estimateTokens: 50 },
  },
];

const DEPTH_LABEL: Record<AssistantDepth, string> = {
  simple: "간단히",
  detailed: "자세히",
  precise: "가장 정확하게",
};

type AssistantResponse = {
  text: string;
  source: "db" | "web" | "context";
  category: "MUSIC" | "BIG" | "TASTE";
  citations: Citation[];
  tokensSpent: number;
  balanceAfter: number;
  events: AssistantEvent[];
  songs: AssistantSong[];
  depth: AssistantDepth;
};

export type KeptEventInput = { monthEventId: string; title: string };

type UserTurn = { role: "user"; key: string; text: string };
type AssistantTurn = {
  role: "assistant";
  key: string;
  question: string;
  answer: AssistantResponse;
};
type ChatTurn = UserTurn | AssistantTurn;

// page.tsx 가 초기 로드해서 내려주는 모양. answer 는 AnswerSnapshot.
// V4 — depth 도 보존. 옛 저장(depth 필드 없음) 호환을 위해 optional.
export type InitialSavedAnswer = {
  id: string;
  question: string;
  createdAtIso: string;
  answer: {
    text: string;
    source: "db" | "web" | "context";
    category: "MUSIC" | "BIG" | "TASTE";
    citations: Citation[];
    songs: AssistantSong[];
    events: { title: string; description: string; section: string }[];
    depth?: AssistantDepth;
  };
};

type SavedItem = InitialSavedAnswer;

function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// S1 — 출처 링크 scheme 가드. Anthropic 검색 결과 url 은 거의 항상
// http(s) 지만 클라 측에서 직접 href 로 렌더하기 전에 한 번 더 검증.
// javascript:/data: 등 비정상 scheme 차단 → XSS 가드.
function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// 답의 출처 배지 — DB(우리 자료)는 emerald 강조, web/context 는 무채색.
// 라벨은 칩 hint 와 같은 어휘 ("우리 자료"/"인터넷 검색"/"이전 답") 로 일관.
function sourceBadge(source: "db" | "web" | "context"): {
  label: string;
  className: string;
} {
  if (source === "db") {
    return {
      label: "우리 자료",
      className:
        "inline-flex items-center rounded-full border-2 border-emerald-500 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900",
    };
  }
  if (source === "web") {
    return {
      label: "인터넷 검색",
      className:
        "inline-flex items-center rounded-full border-2 border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700",
    };
  }
  return {
    label: "이전 답에서",
    className:
      "inline-flex items-center rounded-full border-2 border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700",
  };
}

// P1 — 비서 저장 답은 가족 룸 멤버에게도 보임 (UserMemory 가 createdVia
// 무관하게 listRoomMemories 로 노출됨). 저장 의도 가질 때마다 보이도록
// 짧은 안내. 결정: 토글 안 만들고 항상 공유.
const FAMILY_SHARE_NOTE = "저장하면 가족 룸 멤버에게도 보여요.";

export function AssistantPanel({
  year,
  month,
  keptEventIds,
  onAddEvent,
  initialSavedAnswers,
}: {
  year: number;
  month: number;
  keptEventIds: Set<string>;
  onAddEvent: (k: KeptEventInput) => void;
  initialSavedAnswers: InitialSavedAnswer[];
}) {
  const [mode, setMode] = useState<"chat" | "saved">("chat");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [savedAnswers, setSavedAnswers] = useState<SavedItem[]>(
    initialSavedAnswers,
  );
  // 채팅 턴 key → 저장 id (이미 저장된 턴인지 추적용).
  const [savedByTurnKey, setSavedByTurnKey] = useState<Record<string, string>>({});
  const [inputText, setInputText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [isPending, startTransition] = useTransition();
  // V4 — 현재 선택된 깊이. 후속 질문은 같은 깊이를 이어가되 사용자가
  // 언제든 바꿀 수 있음. 페이지를 떠나면 잊고 기본값("simple")으로 복귀.
  const [depth, setDepth] = useState<AssistantDepth>("simple");

  // 채팅 thread 스크롤 컨테이너. 새 메시지 도착 시 맨 아래(최신)로 자동
  // 이동. instant scroll — 시니어 친화 (smooth 는 살짝 어지러울 수 있음).
  // commit 후 effect 가 실행되므로 답 카드(SongCard·events 등) 렌더 끝나
  // 정확한 scrollHeight 로 이동한다.
  const threadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function ask(question: string) {
    const q = question.trim();
    if (q === "") return;
    setError(null);
    setInsufficient(false);
    // prior = 현재 messages 를 백엔드 입력 모양으로. clamp 는 백엔드에서.
    const prior = messages.map((m) => ({
      role: m.role,
      text: m.role === "user" ? m.text : m.answer.text,
    }));
    const userTurn: UserTurn = { role: "user", key: makeKey(), text: q };
    setMessages((prev) => [...prev, userTurn]);
    startTransition(async () => {
      // B1 — 실패 시 직전 user turn 롤백. 안 그러면 다음 ask 의 prior 에
      // 답 없는 user turn 이 남아 [user, user] 연속이 되고 Anthropic 이
      // 400 으로 거부 + 컨텍스트도 깨짐. fetch throw / 402 / non-OK 모두
      // 같은 처리.
      const rollback = () => {
        setMessages((prev) => prev.filter((m) => m.key !== userTurn.key));
      };
      try {
        const res = await fetch("/api/timemachine/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, year, month, prior, depth }),
        });
        if (res.status === 402) {
          setInsufficient(true);
          setError("토큰이 부족해요.");
          rollback();
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setError(
            body.message ?? "답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
          rollback();
          return;
        }
        const data = (await res.json()) as AssistantResponse;
        const aTurn: AssistantTurn = {
          role: "assistant",
          key: makeKey(),
          question: q,
          answer: data,
        };
        setMessages((prev) => [...prev, aTurn]);
      } catch (err) {
        console.error("[assistant-ask]", err);
        setError("답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
        rollback();
      }
    });
  }

  function handleSave(turn: AssistantTurn) {
    if (savedByTurnKey[turn.key]) return;
    setError(null);
    startTransition(async () => {
      try {
        const snapshot = {
          text: turn.answer.text,
          source: turn.answer.source,
          category: turn.answer.category,
          citations: turn.answer.citations,
          songs: turn.answer.songs,
          events: turn.answer.events.map((e) => ({
            title: e.title,
            description: e.description,
            section: e.section,
          })),
          depth: turn.answer.depth,
        };
        const { id } = await saveAssistantAnswerAction(
          year,
          month,
          turn.question,
          snapshot,
        );
        setSavedByTurnKey((prev) => ({ ...prev, [turn.key]: id }));
        setSavedAnswers((prev) => [
          {
            id,
            question: turn.question,
            createdAtIso: new Date().toISOString(),
            answer: snapshot,
          },
          ...prev,
        ]);
      } catch (err) {
        console.error("[assistant-save]", err);
        setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAssistantAnswerAction(year, month, id);
        setSavedAnswers((prev) => prev.filter((s) => s.id !== id));
        // 채팅에서 다시 저장 가능하도록 mapping 도 제거.
        setSavedByTurnKey((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k] === id) delete next[k];
          }
          return next;
        });
      } catch (err) {
        console.error("[assistant-delete]", err);
        setError("삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
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

      {/* 모드 토글 */}
      <div className="flex gap-2" role="tablist" aria-label="비서 모드">
        <TabButton
          active={mode === "chat"}
          onClick={() => setMode("chat")}
          label={`채팅${messages.length > 0 ? ` (${messages.filter((m) => m.role === "assistant").length})` : ""}`}
        />
        <TabButton
          active={mode === "saved"}
          onClick={() => setMode("saved")}
          label={`저장된 답변${savedAnswers.length > 0 ? ` (${savedAnswers.length})` : ""}`}
        />
      </div>

      {mode === "chat" ? (
        <>
          {/* V4 — 답의 깊이 토글. 칩 위에 한 줄로. 시니어 친화 라벨 + 추정
              토큰을 미리 보여줌. 모델 이름은 절대 노출 X. */}
          <fieldset className="flex flex-col gap-2 rounded-md border-2 border-violet-200 bg-white p-4">
            <legend className="px-2 text-base font-semibold text-zinc-800">
              답의 깊이
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DEPTH_OPTIONS.map((opt) => {
                const active = depth === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDepth(opt.key)}
                    disabled={isPending}
                    className={
                      "flex min-h-[60px] flex-col items-start justify-center rounded-md border-2 px-4 py-2 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
                      (active
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-violet-300 bg-white text-zinc-900 hover:bg-violet-50")
                    }
                  >
                    <span className="text-base font-bold sm:text-lg">
                      {opt.info.label}
                    </span>
                    <span
                      className={
                        "text-sm " + (active ? "text-violet-100" : "text-zinc-600")
                      }
                    >
                      {opt.info.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="px-2 text-sm text-zinc-600">
              더 정확한 답이 필요하면 &quot;자세히&quot; 또는 &quot;가장 정확하게&quot;를 골라보세요. 노래·큰 사건처럼{" "}
              <span className="font-semibold text-emerald-700">우리 자료</span>에 있는 답은 깊이와 상관없이 무료예요.
            </p>
          </fieldset>

          {/* 대화 thread — 일반 채팅방 패턴: 답이 위, 입력은 아래.
              고정 max-height + 내부 스크롤. 시니어 친화 위해 스크롤바
              두께 12px (기본 thin 보다 두꺼움). 모바일은 자동 숨김. */}
          {messages.length > 0 && (
            <div
              ref={threadRef}
              className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto overscroll-contain pr-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-violet-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-400 [&::-webkit-scrollbar-thumb:hover]:bg-violet-500"
            >
              {messages.map((m) =>
                m.role === "user" ? (
                  <div
                    key={m.key}
                    className="self-end max-w-[90%] rounded-md bg-violet-700 px-4 py-3 text-base text-white"
                  >
                    {m.text}
                  </div>
                ) : (
                  <AssistantTurnView
                    key={m.key}
                    turn={m}
                    keptEventIds={keptEventIds}
                    onAddEvent={onAddEvent}
                    onSave={handleSave}
                    isSaved={Boolean(savedByTurnKey[m.key])}
                    isBusy={isPending}
                  />
                ),
              )}
            </div>
          )}

          {/* 추천 질문 칩 — 클릭 전에 출처(무료/검색) 힌트도 함께. 입력
              바로 위에 두어 사용자가 thread 끝에서 바로 다음 질문 선택. */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => {
              const isDb = q.hint.includes("우리 자료");
              return (
                <button
                  key={q.text}
                  type="button"
                  onClick={() => ask(q.text)}
                  disabled={isPending}
                  className="flex min-h-[64px] flex-col items-start rounded-md border-2 border-violet-400 bg-white px-4 py-2 text-left hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-base font-semibold text-violet-900 sm:text-lg">
                    {q.text}
                  </span>
                  <span
                    className={
                      "mt-0.5 text-xs font-semibold " +
                      (isDb ? "text-emerald-700" : "text-zinc-600")
                    }
                  >
                    {q.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 에러 — 입력 바로 위 */}
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
          </div>

          {/* 직접 입력 — 패널 최하단 (일반 채팅방 패턴) */}
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
        </>
      ) : (
        <SavedAnswersList
          items={savedAnswers}
          onDelete={handleDelete}
          isBusy={isPending}
        />
      )}
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "min-h-[44px] rounded-md border-2 px-4 py-2 text-base font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 " +
        (active
          ? "border-violet-700 bg-violet-700 text-white"
          : "border-violet-300 bg-white text-violet-900 hover:bg-violet-100")
      }
    >
      {label}
    </button>
  );
}

function AssistantTurnView({
  turn,
  keptEventIds,
  onAddEvent,
  onSave,
  isSaved,
  isBusy,
}: {
  turn: AssistantTurn;
  keptEventIds: Set<string>;
  onAddEvent: (k: KeptEventInput) => void;
  onSave: (t: AssistantTurn) => void;
  isSaved: boolean;
  isBusy: boolean;
}) {
  const a = turn.answer;
  return (
    <div className="flex flex-col gap-4 rounded-md border-2 border-violet-300 bg-white p-5">
      {/* 상단 배지 줄 — source(우리 자료/검색/이전 답) + depth(간단히/자세히/…) */}
      <div className="flex flex-wrap items-center gap-2">
        {(() => {
          const b = sourceBadge(a.source);
          return <span className={b.className}>{b.label}</span>;
        })()}
        <span className="inline-flex items-center rounded-full border-2 border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900">
          {DEPTH_LABEL[a.depth]} 답
        </span>
      </div>
      <p className="whitespace-pre-line text-lg leading-relaxed text-zinc-900">
        {a.text}
      </p>

      {a.source === "db" && a.songs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {a.songs.map((s, i) => (
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

      {a.source === "db" && a.events.length > 0 && (
        <ul className="flex flex-col gap-2">
          {a.events.map((e) => {
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
                  onClick={() =>
                    onAddEvent({ monthEventId: e.id, title: e.title })
                  }
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

      {/* 검색 답 → 출처. S1 — http(s) 만 링크, 그 외는 텍스트. */}
      {(a.source === "web" || a.source === "context") &&
        a.citations.length > 0 && (
          <div className="border-t-2 border-zinc-200 pt-3">
            <p className="mb-2 text-base font-semibold text-zinc-800">출처</p>
            <ul className="flex flex-col gap-1">
              {a.citations.slice(0, 6).map((c) => (
                <li key={c.url} className="text-sm">
                  {isSafeHttpUrl(c.url) ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-800 underline hover:text-violet-900"
                    >
                      {c.title}
                    </a>
                  ) : (
                    <span className="text-zinc-700">{c.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* 하단 액션 — 차감 안내 + 저장 버튼 + 가족 공유 안내(P1) */}
      <div className="flex flex-col gap-2 border-t-2 border-zinc-200 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-zinc-600">
          {sourceLabel(a)}
        </p>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            onClick={() => onSave(turn)}
            disabled={isSaved || isBusy}
            className="shrink-0 min-h-[44px] rounded-md border-2 border-emerald-500 bg-emerald-50 px-4 py-2 text-base font-semibold text-emerald-900 hover:bg-emerald-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-600"
          >
            {isSaved ? "저장됨" : "이 답 저장"}
          </button>
          <p className="text-xs text-zinc-500">{FAMILY_SHARE_NOTE}</p>
        </div>
      </div>
    </div>
  );
}

// 출처는 상단 배지로 이미 표시 — 여기는 비용 안내에 집중.
function sourceLabel(a: AssistantResponse): string {
  if (a.tokensSpent === 0) return "토큰을 쓰지 않았어요.";
  return `토큰 ${a.tokensSpent}개 사용 · 남은 ${a.balanceAfter.toLocaleString()}개`;
}

function SavedAnswersList({
  items,
  onDelete,
  isBusy,
}: {
  items: SavedItem[];
  onDelete: (id: string) => void;
  isBusy: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border-2 border-dashed border-violet-300 bg-white p-6 text-center text-base text-zinc-700">
        아직 저장한 답이 없어요. 채팅에서 마음에 든 답을 &quot;이 답 저장&quot; 으로
        보관해 두면, 여기서 토큰 없이 다시 볼 수 있어요. (저장된 답은 가족 룸 멤버에게도 보여요.)
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* P1 — 패널 상단에 한 줄 안내. 저장된 답이 가족에게 노출됨을 명시. */}
      <p
        className="rounded-md border-2 border-violet-300 bg-white px-4 py-2 text-sm text-zinc-700"
        role="note"
      >
        저장된 답변은 가족 룸 멤버에게도 보여요.
      </p>
      <ul className="flex flex-col gap-3">
      {items.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-3 rounded-md border-2 border-violet-300 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-violet-900">
                Q. {s.question}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {(() => {
                  const b = sourceBadge(s.answer.source);
                  return <span className={b.className}>{b.label}</span>;
                })()}
                {s.answer.depth && (
                  <span className="inline-flex items-center rounded-full border-2 border-violet-300 bg-violet-50 px-3 py-0.5 text-xs font-semibold text-violet-900">
                    {DEPTH_LABEL[s.answer.depth]} 답
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              disabled={isBusy}
              aria-label={`저장된 답 빼기: ${s.question}`}
              className="shrink-0 rounded-md border-2 border-zinc-300 bg-white px-3 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              빼기
            </button>
          </div>
          <p className="whitespace-pre-line text-lg leading-relaxed text-zinc-900">
            {s.answer.text}
          </p>
          {s.answer.songs.length > 0 && (
            <ul className="flex flex-col gap-3">
              {s.answer.songs.map((sg, i) => (
                <SongCard
                  key={`${sg.title}-${sg.artist}-${i}`}
                  rank={sg.rank}
                  title={sg.title}
                  artist={sg.artist}
                  eraColor={sg.eraColor}
                />
              ))}
            </ul>
          )}
          {s.answer.events.length > 0 && (
            <ul className="flex flex-col gap-2">
              {s.answer.events.map((e, i) => (
                <li
                  key={`${e.title}-${i}`}
                  className="rounded-md border-2 border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="text-base font-semibold text-zinc-900">
                    {e.title}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-base text-zinc-700">
                      {e.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {s.answer.citations.length > 0 && (
            <div className="border-t-2 border-zinc-200 pt-3">
              <p className="mb-2 text-sm font-semibold text-zinc-800">출처</p>
              <ul className="flex flex-col gap-1">
                {s.answer.citations.slice(0, 6).map((c) => (
                  <li key={c.url} className="text-sm">
                    {isSafeHttpUrl(c.url) ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-800 underline hover:text-violet-900"
                      >
                        {c.title}
                      </a>
                    ) : (
                      <span className="text-zinc-700">{c.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            저장 · 토큰 0
          </p>
        </li>
      ))}
      </ul>
    </div>
  );
}
