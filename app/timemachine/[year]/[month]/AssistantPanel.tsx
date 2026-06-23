"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { BookOpen, Search, ListChecks, type LucideIcon } from "lucide-react";

import { SongCard } from "./SongCard";
import {
  saveAssistantAnswerAction,
  deleteAssistantAnswerAction,
} from "./assistant-actions";
import { getEraCatalog, addEraItemAsLifeEvent } from "./era-pick-actions";
import type { EraEvent, EraSong } from "@/lib/era-events";

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

// 2026-06-07 — 모드 선택 UI 도입에 따라 칩을 두 갈래로 분리.
//   STORIES_CHIPS : "그 시절 이야기" 모드 — 우리 자료에서 끌어오는 질문 (무료)
//   ASK_CHIPS     : "AI에게 물어보기" 모드 — 인터넷에서 찾아오는 질문 (토큰 사용)
// 백엔드(/api/timemachine/assistant) 는 키워드로 분기하므로 모드 선택은
// 어디까지나 UI 가이드. 사용자가 "stories" 모드에서 자유 질문을 던져 검색
// 폴백이 되어도 백엔드가 정상 처리.
const STORIES_CHIPS: { text: string; hint: string }[] = [
  { text: "이때 유행한 노래는?", hint: "우리 자료" },
  { text: "이때 나라가 떠들썩했던 일은?", hint: "우리 자료" },
];
const ASK_CHIPS: { text: string; hint: string }[] = [
  { text: "그때 인기 드라마·영화는?", hint: "인터넷 검색" },
  { text: "그 시절 유행은?", hint: "인터넷 검색" },
  { text: "그때 물가나 살림은?", hint: "인터넷 검색" },
];

// G1 — 비서 모드. "selecting" = 3버튼 허브, "era-selecting" = 그 시절 갈래
// (browse/ask), "browse"(G2) = 시대 목록에서 고르기, "tutorial" = 사용법 안내.
// "stories"(우리 자료 채팅)는 코드 보존 — 직접 진입은 빠졌으나 저장된 답
// 열기 경로에서 여전히 사용.
type AssistantMode =
  | "selecting"
  | "era-selecting"
  | "browse"
  | "stories"
  | "ask"
  | "tutorial";

// G2 — 연대 탭. 마지막(2010)은 2020~2023 도 흡수 (era-pick-actions 와 동일).
const DECADES = [1980, 1990, 2000, 2010] as const;
function decadeOf(year: number): number {
  return year >= 2010 ? 2010 : Math.floor(year / 10) * 10;
}
function decadeLabel(d: number): string {
  return `${d}년대`;
}

type TutorialTurn = { role: "user" | "assistant"; text: string };

const TUTORIAL_CHIPS = [
  "어떻게 시작하면 되나요?",
  "이야기는 어떻게 기록되나요?",
  "토큰이 뭔가요?",
  "가족과 함께 쓸 수 있나요?",
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

// 답의 출처 배지 — DB(우리 자료)는 success 강조, web/context 는 무채색.
// 라벨은 칩 hint 와 같은 어휘 ("우리 자료"/"인터넷 검색"/"이전 답") 로 일관.
function sourceBadge(source: "db" | "web" | "context"): {
  label: string;
  className: string;
} {
  if (source === "db") {
    return {
      label: "우리 자료",
      className:
        "inline-flex items-center rounded-full border-2 border-success bg-success/10 px-3 py-1 text-xs font-semibold text-success",
    };
  }
  if (source === "web") {
    return {
      label: "인터넷 검색",
      className:
        "inline-flex items-center rounded-full border-2 border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink-soft",
    };
  }
  return {
    label: "이전 답에서",
    className:
      "inline-flex items-center rounded-full border-2 border-line bg-canvas px-3 py-1 text-xs font-semibold text-ink-soft",
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
  onNavigate,
}: {
  year: number;
  month: number;
  keptEventIds: Set<string>;
  onAddEvent: (k: KeptEventInput) => void;
  initialSavedAnswers: InitialSavedAnswer[];
  // G1 — 버튼1("이야기 나누기") 클릭 시 모달 닫고 라우팅. 없으면 무시.
  onNavigate?: (href: string) => void;
}) {
  // 2026-06-07 — 두 레벨의 모드:
  //   mode : 비서 본 모드 (selecting → stories / ask). 첫 진입은 selecting.
  //   view : 그 모드 안에서 채팅 / 저장된 답변 탭.
  const [mode, setMode] = useState<AssistantMode>("selecting");
  const [view, setView] = useState<"chat" | "saved">("chat");
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

  // G1 — 튜토리얼 채팅 상태. 모드 "tutorial" 에서만 사용. 토큰 차감 X.
  const [tutMsgs, setTutMsgs] = useState<TutorialTurn[]>([]);
  const [tutInput, setTutInput] = useState("");
  const [tutIsPending, startTutTransition] = useTransition();
  const [tutError, setTutError] = useState<string | null>(null);
  const tutThreadRef = useRef<HTMLDivElement | null>(null);

  // G2 — "그 시절 목록에서 고르기" 상태. 모드 "browse" 에서만 사용. 무료.
  const [eraData, setEraData] = useState<{ events: EraEvent[]; songs: EraSong[] } | null>(null);
  const [eraLoading, setEraLoading] = useState(false);
  const [eraError, setEraError] = useState<string | null>(null);
  const [decade, setDecade] = useState<number>(1990);
  const [eraTab, setEraTab] = useState<"events" | "songs">("events");
  // 이번 세션에 담은 항목 key(`${kind}:${id}`) — 옵티미스틱 "✓ 담음" 표시.
  // life_event 는 monthEventId 를 안 채워 영구 추적이 안 되므로 세션 한정.
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [, startEraTransition] = useTransition();

  // browse 진입 시 카탈로그 lazy 로드 (모든 페이지에서 prefetch 안 함).
  useEffect(() => {
    if (mode !== "browse" || eraData || eraLoading) return;
    setEraLoading(true);
    setEraError(null);
    getEraCatalog()
      .then((d) => {
        setEraData({ events: d.events, songs: d.songs });
        setDecade(d.defaultDecade);
      })
      .catch(() => setEraError("목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."))
      .finally(() => setEraLoading(false));
  }, [mode, eraData, eraLoading]);

  function addEraItem(kind: "event" | "song", id: string) {
    const key = `${kind}:${id}`;
    if (addedKeys.has(key)) return;
    setEraError(null);
    setAddedKeys((prev) => new Set(prev).add(key)); // 옵티미스틱
    startEraTransition(async () => {
      try {
        const res = await addEraItemAsLifeEvent(kind, id);
        if (!res.ok) throw new Error(res.reason);
      } catch {
        setAddedKeys((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
        setEraError("담지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  // 채팅 thread 스크롤 컨테이너. 새 메시지 도착 시 맨 아래(최신)로 자동
  // 이동. instant scroll — 시니어 친화 (smooth 는 살짝 어지러울 수 있음).
  // commit 후 effect 가 실행되므로 답 카드(SongCard·events 등) 렌더 끝나
  // 정확한 scrollHeight 로 이동한다.
  const threadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (tutThreadRef.current) tutThreadRef.current.scrollTop = tutThreadRef.current.scrollHeight;
  }, [tutMsgs]);

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

  function askTutorial(q: string) {
    const question = q.trim();
    if (!question || tutIsPending) return;
    setTutError(null);
    const prior = tutMsgs.map((m) => ({ role: m.role, text: m.text }));
    setTutMsgs((prev) => [...prev, { role: "user" as const, text: question }]);
    startTutTransition(async () => {
      try {
        const res = await fetch("/api/tutorial-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, prior }),
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { text?: string };
        setTutMsgs((prev) => [...prev, { role: "assistant" as const, text: data.text ?? "..." }]);
      } catch {
        setTutMsgs((prev) => prev.slice(0, -1));
        setTutError("답을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
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

  // G1 — 3버튼 허브. 채팅·저장 state 는 부모에 살아 있어 모드 전환에도 보존.
  if (mode === "selecting") {
    return (
      <HubView
        onNavigate={onNavigate}
        onPickEra={() => setMode("era-selecting")}
        onPickTutorial={() => setMode("tutorial")}
      />
    );
  }

  // G2 — "그 시절 이야기" 갈래: 목록에서 고르기(browse) vs AI 대화(ask).
  if (mode === "era-selecting") {
    return (
      <EraSelectionView
        savedCount={savedAnswers.length}
        onPickBrowse={() => setMode("browse")}
        onPickAsk={() => { setMode("ask"); setView("chat"); }}
        onOpenSaved={() => { setMode("stories"); setView("saved"); }}
        onBack={() => setMode("selecting")}
      />
    );
  }

  // G2 — 시대 목록에서 직접 고르기. 연대 탭 + 사건/음악 탭 + "기억나요" 담기.
  if (mode === "browse") {
    const items = !eraData
      ? []
      : eraTab === "events"
        ? eraData.events.filter((e) => decadeOf(e.year) === decade)
        : eraData.songs.filter((s) => decadeOf(s.year) === decade);

    return (
      <aside className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("era-selecting")}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-brand bg-surface px-3 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            ← 뒤로
          </button>
          <span className="text-base font-semibold text-action sm:text-lg">
            📋 그 시절 목록에서 고르기
          </span>
        </div>

        <p className="text-base text-ink-soft">
          기억나는 일이나 노래를 고르면 내 인생 연혁에 담겨요. 나중에 이야기를 덧붙일 수 있어요.
        </p>

        {/* 연대 탭 */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="연대 선택">
          {DECADES.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={decade === d}
              onClick={() => setDecade(d)}
              className={
                "min-h-[48px] rounded-md border-2 px-4 py-2 text-base font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
                (decade === d
                  ? "border-brand bg-banner text-action"
                  : "border-line bg-surface text-ink-soft hover:bg-banner")
              }
            >
              {decadeLabel(d)}
            </button>
          ))}
        </div>

        {/* 사건 / 음악 탭 */}
        <div className="flex gap-2" role="tablist" aria-label="종류 선택">
          <TabButton active={eraTab === "events"} onClick={() => setEraTab("events")} label="📅 사건" />
          <TabButton active={eraTab === "songs"} onClick={() => setEraTab("songs")} label="🎵 음악" />
        </div>

        <div aria-live="polite">
          {eraError && <p className="text-base text-rose-700" role="alert">{eraError}</p>}
        </div>

        {eraLoading && <p className="text-base text-ink-soft">목록을 불러오는 중…</p>}

        {!eraLoading && !eraError && items.length === 0 && (
          <p className="rounded-md border-2 border-dashed border-brand bg-surface p-6 text-center text-base text-ink-soft">
            이 시기의 {eraTab === "events" ? "사건" : "음악"}은 아직 준비 중이에요. 다른 연대를 골라보세요.
          </p>
        )}

        {!eraLoading && items.length > 0 && (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain pr-2 [scrollbar-width:auto] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-banner [&::-webkit-scrollbar]:w-3">
            {items.map((it) => {
              const isEvent = eraTab === "events";
              const key = `${isEvent ? "event" : "song"}:${it.id}`;
              const added = addedKeys.has(key);
              const title = isEvent
                ? (it as EraEvent).title
                : `${(it as EraSong).title}${(it as EraSong).artist ? ` — ${(it as EraSong).artist}` : ""}`;
              const sub = isEvent
                ? (it as EraEvent).description
                : null;
              return (
                <li
                  key={it.id}
                  className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-ink">
                      <span className="text-ink-soft">{it.year}</span> {title}
                    </p>
                    {sub && <p className="mt-1 text-base text-ink-soft">{sub}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => addEraItem(isEvent ? "event" : "song", it.id)}
                    disabled={added}
                    className="shrink-0 min-h-[48px] rounded-md border-2 border-amber-500 bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-soft"
                  >
                    {added ? "✓ 담음" : "기억나요 +"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    );
  }

  // G1 — 사용법 안내 챗. 토큰 차감 X, 저장 X.
  if (mode === "tutorial") {
    return (
      <aside className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMode("selecting")}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-brand bg-surface px-3 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            ← 뒤로
          </button>
          <span className="text-base font-semibold text-action sm:text-lg">❓ 사용법 물어보기</span>
        </div>

        {tutMsgs.length === 0 && (
          <p className="text-base text-ink-soft">
            뭐가 궁금하세요? 아래 버튼을 누르거나 직접 물어보세요.
          </p>
        )}

        {tutMsgs.length > 0 && (
          <div
            ref={tutThreadRef}
            className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto overscroll-contain pr-2 [scrollbar-width:auto] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand [&::-webkit-scrollbar-thumb:hover]:bg-action [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-banner [&::-webkit-scrollbar]:w-3"
          >
            {tutMsgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="self-end max-w-[90%] rounded-md bg-action px-4 py-3 text-base text-white">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="rounded-md border-2 border-brand bg-surface p-4">
                  <p className="whitespace-pre-line text-lg leading-relaxed text-ink">{m.text}</p>
                </div>
              ),
            )}
          </div>
        )}

        {tutMsgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {TUTORIAL_CHIPS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => askTutorial(q)}
                disabled={tutIsPending}
                className="flex min-h-[56px] items-center rounded-md border-2 border-brand bg-surface px-4 py-2 text-left hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base font-semibold text-action">{q}</span>
              </button>
            ))}
          </div>
        )}

        <div aria-live="polite">
          {tutError && <p className="text-base text-rose-700" role="alert">{tutError}</p>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={tutInput}
            onChange={(e) => setTutInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !tutIsPending) {
                e.preventDefault();
                askTutorial(tutInput);
                setTutInput("");
              }
            }}
            placeholder="궁금한 점을 물어보세요"
            aria-label="사용법 질문"
            disabled={tutIsPending}
            className="min-h-[52px] flex-1 rounded-md border-2 border-brand bg-surface px-4 py-3 text-lg text-ink focus:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => { askTutorial(tutInput); setTutInput(""); }}
            disabled={tutIsPending || tutInput.trim() === ""}
            className="min-h-[52px] rounded-md bg-action px-6 py-3 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tutIsPending ? "답하는 중…" : "물어보기"}
          </button>
        </div>
      </aside>
    );
  }

  // 모드별 상수 (selecting 이 아닐 때만 의미).
  const chips = mode === "stories" ? STORIES_CHIPS : ASK_CHIPS;
  const modeTitle = mode === "stories" ? "그 시절 이야기" : "AI에게 물어보기";
  const ModeIcon: LucideIcon = mode === "stories" ? BookOpen : Search;

  return (
    <aside className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-6">
      {/* 모드 헤더 — 뒤로 + 현재 모드 표시 */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMode("era-selecting")}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-brand bg-surface px-3 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          ← 뒤로
        </button>
        <span className="inline-flex items-center gap-1.5 text-base font-semibold text-action sm:text-lg">
          <ModeIcon strokeWidth={1.75} aria-hidden className="h-5 w-5" />
          {modeTitle}
        </span>
      </div>

      {/* 채팅 / 저장된 답변 탭 */}
      <div className="flex gap-2" role="tablist" aria-label="비서 화면">
        <TabButton
          active={view === "chat"}
          onClick={() => setView("chat")}
          label={`채팅${messages.length > 0 ? ` (${messages.filter((m) => m.role === "assistant").length})` : ""}`}
        />
        <TabButton
          active={view === "saved"}
          onClick={() => setView("saved")}
          label={`저장된 답변${savedAnswers.length > 0 ? ` (${savedAnswers.length})` : ""}`}
        />
      </div>

      {view === "chat" ? (
        <>
          {/* V4 — 답의 깊이 토글. "AI에게 물어보기" 모드에서만 노출.
              "그 시절 이야기" 모드는 우리 자료 = 무료라 깊이 무관. */}
          {mode === "ask" && (
            <fieldset className="flex flex-col gap-2 rounded-md border-2 border-brand bg-surface p-4">
              <legend className="px-2 text-base font-semibold text-ink">
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
                        "flex min-h-[60px] flex-col items-start justify-center rounded-md border-2 px-4 py-2 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
                        (active
                          ? "border-brand bg-banner text-action"
                          : "border-line bg-surface text-ink-soft hover:bg-banner")
                      }
                    >
                      <span className="text-base font-bold sm:text-lg">
                        {opt.info.label}
                      </span>
                      <span
                        className={
                          "text-sm " + (active ? "text-action" : "text-ink-soft")
                        }
                      >
                        {opt.info.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/* 대화 thread — 일반 채팅방 패턴: 답이 위, 입력은 아래.
              고정 max-height + 내부 스크롤. 시니어 친화 위해 스크롤바
              두께 12px (기본 thin 보다 두꺼움). 모바일은 자동 숨김. */}
          {messages.length > 0 && (
            <div
              ref={threadRef}
              className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto overscroll-contain pr-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-banner [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-brand [&::-webkit-scrollbar-thumb:hover]:bg-action"
            >
              {messages.map((m) =>
                m.role === "user" ? (
                  <div
                    key={m.key}
                    className="self-end max-w-[90%] rounded-md bg-action px-4 py-3 text-base text-white"
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

          {/* 모드별 추천 질문 칩 — 한 모드당 2~3개. 입력 바로 위. */}
          <div className="flex flex-wrap gap-2">
            {chips.map((q) => {
              const isDb = q.hint.includes("우리 자료");
              return (
                <button
                  key={q.text}
                  type="button"
                  onClick={() => ask(q.text)}
                  disabled={isPending}
                  className="flex min-h-[64px] flex-col items-start rounded-md border-2 border-brand bg-surface px-4 py-2 text-left hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-base font-semibold text-action sm:text-lg">
                    {q.text}
                  </span>
                  <span
                    className={
                      "mt-0.5 text-xs font-semibold " +
                      (isDb ? "text-success" : "text-ink-soft")
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
              className="min-h-[52px] flex-1 rounded-md border-2 border-brand bg-surface px-4 py-3 text-lg text-ink focus:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => {
                ask(inputText);
                setInputText("");
              }}
              disabled={isPending || inputText.trim() === ""}
              className="min-h-[52px] rounded-md bg-action px-6 py-3 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

// G1 — 허브 뷰 (3버튼). "selecting" 모드에서 렌더.
function HubView({
  onNavigate,
  onPickEra,
  onPickTutorial,
}: {
  onNavigate?: (href: string) => void;
  onPickEra: () => void;
  onPickTutorial: () => void;
}) {
  return (
    <aside className="flex flex-col gap-5 rounded-md border-2 border-brand bg-banner p-6">
      <div>
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">무엇을 찾아볼까요?</h2>
        <p className="mt-2 text-base text-ink-soft sm:text-lg">아래 중 하나를 골라보세요.</p>
      </div>
      <div className="flex flex-col gap-3">
        <HubCard
          emoji="💬"
          title="이야기 나누기"
          desc="AI 동반자와 이야기를 나누면 인생 연혁에 자동으로 기록돼요."
          tag="무료"
          tagClass="border-success bg-success/10 text-success"
          onClick={() => onNavigate?.("/life-timeline/companion")}
        />
        <HubCard
          emoji="🕰️"
          title="그 시절 이야기"
          desc="그 시절 노래·큰 사건을 함께 떠올려요."
          tag="일부 토큰 사용"
          tagClass="border-line bg-canvas text-ink"
          onClick={onPickEra}
        />
        <HubCard
          emoji="❓"
          title="사용법 물어보기"
          desc="Lifebook 사용 중 궁금한 점을 물어보세요."
          tag="무료"
          tagClass="border-success bg-success/10 text-success"
          onClick={onPickTutorial}
        />
      </div>
    </aside>
  );
}

function HubCard({
  emoji,
  title,
  desc,
  tag,
  tagClass,
  onClick,
}: {
  emoji: string;
  title: string;
  desc: string;
  tag: string;
  tagClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[96px] items-start gap-4 rounded-md border-2 border-brand bg-surface p-5 text-left hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <span aria-hidden className="text-3xl">{emoji}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xl font-bold text-ink sm:text-2xl">{title}</span>
        <span className="text-base text-ink-soft sm:text-lg">{desc}</span>
        <span className={"mt-1 inline-flex w-fit items-center rounded-full border-2 px-3 py-0.5 text-xs font-semibold " + tagClass}>{tag}</span>
      </div>
    </button>
  );
}

// G2 — "그 시절 이야기" 갈래 선택. "era-selecting" 모드에서 렌더.
//   browse : 시대 목록에서 직접 고르기 (무료, 신규)
//   ask    : AI 에게 물어보며 찾기 (기존, 검색 토큰)
function EraSelectionView({
  savedCount,
  onPickBrowse,
  onPickAsk,
  onOpenSaved,
  onBack,
}: {
  savedCount: number;
  onPickBrowse: () => void;
  onPickAsk: () => void;
  onOpenSaved: () => void;
  onBack: () => void;
}) {
  return (
    <aside className="flex flex-col gap-5 rounded-md border-2 border-brand bg-banner p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-brand bg-surface px-3 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          ← 뒤로
        </button>
        <h2 className="text-xl font-bold text-ink sm:text-2xl">🕰️ 그 시절 이야기</h2>
      </div>

      <div className="flex flex-col gap-3">
        <ModeCard
          icon={ListChecks}
          title="목록에서 고르기"
          desc="그 시절 사건·노래를 보고 기억나는 걸 골라 담아요."
          tag="무료"
          tagClass="border-success bg-success/10 text-success"
          onClick={onPickBrowse}
        />
        <ModeCard
          icon={Search}
          title="AI에게 물어보기"
          desc="인터넷에서 찾아드려요. 더 폭넓게 답할 수 있어요."
          tag="토큰 사용"
          tagClass="border-line bg-canvas text-ink"
          onClick={onPickAsk}
        />
      </div>

      {savedCount > 0 && (
        <div className="border-t-2 border-brand pt-4 text-center">
          <button
            type="button"
            onClick={onOpenSaved}
            className="text-base font-semibold text-action underline hover:text-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            저장된 답변 {savedCount}개 보기 →
          </button>
        </div>
      )}
    </aside>
  );
}

function ModeCard({
  icon: Icon,
  title,
  desc,
  tag,
  tagClass,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  tag: string;
  tagClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[96px] items-start gap-4 rounded-md border-2 border-brand bg-surface p-5 text-left hover:border-brand hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Icon strokeWidth={1.75} aria-hidden className="h-8 w-8 shrink-0 text-action" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xl font-bold text-ink sm:text-2xl">
          {title}
        </span>
        <span className="text-base text-ink-soft sm:text-lg">{desc}</span>
        <span
          className={
            "mt-1 inline-flex w-fit items-center rounded-full border-2 px-3 py-0.5 text-xs font-semibold " +
            tagClass
          }
        >
          {tag}
        </span>
      </div>
    </button>
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
        "min-h-[44px] rounded-md border-2 px-4 py-2 text-base font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
        (active
          ? "border-brand bg-banner text-action"
          : "border-line bg-surface text-ink-soft hover:bg-banner")
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
    <div className="flex flex-col gap-4 rounded-md border-2 border-brand bg-surface p-5">
      {/* 상단 배지 줄 — source(우리 자료/검색/이전 답) + depth(간단히/자세히/…) */}
      <div className="flex flex-wrap items-center gap-2">
        {(() => {
          const b = sourceBadge(a.source);
          return <span className={b.className}>{b.label}</span>;
        })()}
        <span className="inline-flex items-center rounded-full border-2 border-brand bg-banner px-3 py-1 text-xs font-semibold text-action">
          {DEPTH_LABEL[a.depth]} 답
        </span>
      </div>
      <p className="whitespace-pre-line text-lg leading-relaxed text-ink">
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
                className="flex flex-col gap-2 rounded-md border-2 border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-ink">
                    {e.title}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-base text-ink-soft">
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
                  className="shrink-0 rounded-md border-2 border-amber-500 bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-soft"
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
          <div className="border-t-2 border-line pt-3">
            <p className="mb-2 text-base font-semibold text-ink">출처</p>
            <ul className="flex flex-col gap-1">
              {a.citations.slice(0, 6).map((c) => (
                <li key={c.url} className="text-sm">
                  {isSafeHttpUrl(c.url) ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-action underline hover:text-action"
                    >
                      {c.title}
                    </a>
                  ) : (
                    <span className="text-ink-soft">{c.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* 하단 액션 — 차감 안내 + 저장 버튼 + 가족 공유 안내(P1) */}
      <div className="flex flex-col gap-2 border-t-2 border-line pt-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-ink-soft">
          {sourceLabel(a)}
        </p>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            onClick={() => onSave(turn)}
            disabled={isSaved || isBusy}
            className="shrink-0 min-h-[44px] rounded-md border-2 border-success bg-success/10 px-4 py-2 text-base font-semibold text-success hover:bg-success/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-soft"
          >
            {isSaved ? "저장됨" : "이 답 저장"}
          </button>
          <p className="text-xs text-ink-faint">{FAMILY_SHARE_NOTE}</p>
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
      <p className="rounded-md border-2 border-dashed border-brand bg-surface p-6 text-center text-base text-ink-soft">
        아직 저장한 답이 없어요. 채팅에서 마음에 든 답을 &quot;이 답 저장&quot; 으로
        보관해 두면, 여기서 토큰 없이 다시 볼 수 있어요. (저장된 답은 가족 룸 멤버에게도 보여요.)
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* P1 — 패널 상단에 한 줄 안내. 저장된 답이 가족에게 노출됨을 명시. */}
      <p
        className="rounded-md border-2 border-brand bg-surface px-4 py-2 text-sm text-ink-soft"
        role="note"
      >
        저장된 답변은 가족 룸 멤버에게도 보여요.
      </p>
      <ul className="flex flex-col gap-3">
      {items.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-3 rounded-md border-2 border-brand bg-surface p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-action">
                Q. {s.question}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {(() => {
                  const b = sourceBadge(s.answer.source);
                  return <span className={b.className}>{b.label}</span>;
                })()}
                {s.answer.depth && (
                  <span className="inline-flex items-center rounded-full border-2 border-brand bg-banner px-3 py-0.5 text-xs font-semibold text-action">
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
              className="shrink-0 rounded-md border-2 border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-soft hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              빼기
            </button>
          </div>
          <p className="whitespace-pre-line text-lg leading-relaxed text-ink">
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
                  className="rounded-md border-2 border-line bg-canvas p-4"
                >
                  <p className="text-base font-semibold text-ink">
                    {e.title}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-base text-ink-soft">
                      {e.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {s.answer.citations.length > 0 && (
            <div className="border-t-2 border-line pt-3">
              <p className="mb-2 text-sm font-semibold text-ink">출처</p>
              <ul className="flex flex-col gap-1">
                {s.answer.citations.slice(0, 6).map((c) => (
                  <li key={c.url} className="text-sm">
                    {isSafeHttpUrl(c.url) ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-action underline hover:text-action"
                      >
                        {c.title}
                      </a>
                    ) : (
                      <span className="text-ink-soft">{c.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-faint">
            저장 · 토큰 0
          </p>
        </li>
      ))}
      </ul>
    </div>
  );
}
