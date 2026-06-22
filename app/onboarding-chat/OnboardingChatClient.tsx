"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QUESTIONS } from "@/lib/onboarding/questions";
import type { Question } from "@/lib/onboarding/questions";
import {
  completeOnboardingChat,
  extractOnboardingPeople,
  saveOnboardingPerson,
} from "./actions";
import type { ParsedAnswers, PersonCandidate } from "./actions";
import { YearWidget, ChipsWidget, MultiItemWidget, PlaceableMultiItemWidget } from "./widgets";
import type { PlaceInfo } from "@/lib/place-types";

type Msg = { role: "a" | "u"; text: string };
type Phase = "chat" | "summary" | "review" | "people" | "done";

const REQUIRED_KEYS = new Set(["birthYear", "residences", "schools"]);
const SKIP_WORDS = new Set(["넘어가기", "건너뛰기", "스킵", "skip"]);
const isSkipInput = (s: string) => SKIP_WORDS.has(s.trim().toLowerCase());

function qDisplay(q: Question): string {
  let t = q.prompt;
  if (q.kind === "chips") t += "\n(" + q.options.join(" · ") + ")";
  if (q.kind === "textlist" && q.hint) t += "\n" + q.hint;
  return t;
}

function buildAck(key: string, value: unknown): string {
  if (Array.isArray(value) && (value as unknown[]).length === 0) return "";
  switch (key) {
    case "birthYear": return `${value}년생이시군요! 반갑습니다.`;
    case "interests": return `${(value as string[]).join(", ")} 좋아하시는군요!`;
    case "residences": return `${(value as string[]).join(", ")}에서 사셨군요.`;
    case "schools": return `${(value as string[]).join(", ")} 다니셨군요, 기억해 뒀어요.`;
    case "favMovies": return `영화는 ${(value as string[]).join(", ")} 좋아하셨군요.`;
    case "favGames": return `${(value as string[]).join(", ")} 즐겨 하셨군요.`;
    case "favMusic": return `${(value as string[]).join(", ")} 좋아하셨군요.`;
    default: return "말씀해 주셔서 감사해요.";
  }
}

const WELCOME =
  "안녕하세요! 저는 라이프북 도우미예요. 😊\n이야기를 시작하기 전에 몇 가지 여쭤봐도 될까요?\n나중에 함께 기억 여행을 할 때 도움이 될 거예요.\n언제든지 '넘어가기'를 눌러 건너뛰셔도 괜찮아요.";
const RETRY_MSG =
  "이 부분은 나중에 시대 이야기를 나눌 때 정말 도움이 돼요. 알려주실 수 있을까요? 아니면 넘어가셔도 괜찮아요.";
const SKIP_ACK = "알겠어요, 나중에 알려주셔도 좋아요.";

export default function OnboardingChatClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Refs — async 콜백에서 최신값 보장 (closures stale 방지)
  const answersRef = useRef<ParsedAnswers>({});
  const skippedRef = useRef(new Set<string>());

  const [messages, setMessages] = useState<Msg[]>([
    { role: "a", text: `${WELCOME}\n\n${qDisplay(QUESTIONS[0])}` },
  ]);
  const [qIdx, setQIdx] = useState(0);
  const [skippedKeys, setSkippedKeys] = useState(new Set<string>());
  const [retriedKeys, setRetriedKeys] = useState(new Set<string>());
  const [inputVal, setInputVal] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [phase, setPhase] = useState<Phase>("chat");
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  // People phase — 추출된 인물 후보 목록 + 현재 인덱스
  const [candidates, setCandidates] = useState<PersonCandidate[]>([]);
  const [candidateIdx, setCandidateIdx] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addBot = (text: string) =>
    setMessages((prev) => [...prev, { role: "a", text }]);
  const addUser = (text: string) =>
    setMessages((prev) => [...prev, { role: "u", text }]);

  function skipKey(key: string) {
    skippedRef.current.add(key);
    setSkippedKeys(new Set(skippedRef.current));
  }

  function storeAnswer(key: string, value: unknown, region?: string | null) {
    (answersRef.current as Record<string, unknown>)[key] = value;
    if (region) answersRef.current.region = region;
  }

  // 프로필 저장 → 인물 추출 → people 페이즈 또는 직행 완료
  function saveAndGoPeople() {
    startTransition(async () => {
      try {
        await completeOnboardingChat(answersRef.current);
      } catch (e) {
        console.error("[onboarding-chat] save", e);
      }

      let cands: PersonCandidate[] = [];
      try {
        cands = await extractOnboardingPeople(answersRef.current);
      } catch (e) {
        console.error("[onboarding-chat] extract-people", e);
      }

      if (cands.length > 0) {
        setCandidates(cands);
        setCandidateIdx(0);
        setPhase("people");
        askCandidate(0, cands);
      } else {
        router.push("/life-timeline");
      }
    });
  }

  // people 페이즈 — 현재 후보에게 성함 질문
  function askCandidate(idx: number, cands: PersonCandidate[]) {
    const c = cands[idx];
    const preamble = idx === 0
      ? "말씀하신 분들을 인물록에 추가해 드릴게요. 😊\n\n"
      : "";
    const question = c.name
      ? `${c.name}님(${c.relation}) 추가할까요? 이름을 바꾸시려면 새 이름을 입력해주세요.`
      : `${c.relation}분 말씀하셨는데, 성함이 어떻게 되세요? 별명이나 이니셜도 괜찮아요.`;
    addBot(preamble + question);
  }

  // people 페이즈 입력 처리 — raw input = 이름 (LLM 파싱 없음)
  async function handlePeopleInput(input: string) {
    const isSkip = isSkipInput(input);
    const c = candidates[candidateIdx];   // 동기 읽기
    const idx = candidateIdx;
    const cands = candidates;

    addUser(isSkip ? "넘어가기" : input);
    setInputVal("");

    if (!isSkip && input.trim()) {
      setIsParsing(true);
      try {
        await saveOnboardingPerson(input.trim(), c.relation);
      } catch (e) {
        console.error("[saveOnboardingPerson]", e);
        // 실패는 무시 — /people 에서 나중에 추가 가능
      } finally {
        setIsParsing(false);
      }
    }

    const nextIdx = idx + 1;
    if (nextIdx >= cands.length) {
      addBot("모두 정리했어요! 인물록에서 언제든 수정하실 수 있어요. 😊\n이제 라이프북을 시작해 볼까요?");
      setPhase("done");
      startTransition(() => { router.push("/life-timeline"); });
    } else {
      setCandidateIdx(nextIdx);
      askCandidate(nextIdx, cands);
    }
  }

  function showSummary() {
    const skipped = Array.from(skippedRef.current); // 항상 최신값
    if (skipped.length === 0) {
      addBot("이제 모든 이야기 해주셨어요! 😊");
      // setPhase 는 saveAndGoPeople 이 결정 (people → done 또는 직행 done)
      saveAndGoPeople();
      return;
    }
    const labels = skipped
      .map((k) => QUESTIONS.find((q) => q.key === k)?.prompt ?? k)
      .map((p) => `• ${p}`)
      .join("\n");
    addBot(
      `오늘 이야기해 주셔서 감사해요! 😊\n\n아직 안 알려주신 것들이 있어요:\n${labels}\n\n지금 더 알려주시겠어요, 나중에 하실래요?`,
    );
    setPhase("summary");
  }

  // isReview/rQueue/curIdx 는 handleSubmit 에서 캡처한 동기값을 받음
  function advanceAfterKey(
    isReview: boolean,
    rQueue: string[],
    curIdx: number,
    ack: string,
  ) {
    if (isReview) {
      const newQueue = rQueue.slice(1);
      if (newQueue.length === 0) {
        // setPhase 는 saveAndGoPeople → people 페이즈 또는 done 이 결정
        setReviewQueue([]);
        addBot(`${ack}\n\n이제 모두 알려주셨어요! 😊`);
        saveAndGoPeople();
      } else {
        setReviewQueue(newQueue);
        const nextQ = QUESTIONS.find((q) => q.key === newQueue[0]);
        addBot(`${ack}\n\n${nextQ ? qDisplay(nextQ) : ""}`);
      }
      return;
    }

    const nextIdx = curIdx + 1;
    if (nextIdx >= QUESTIONS.length) {
      addBot(ack);
      setTimeout(() => showSummary(), 400);
    } else {
      setQIdx(nextIdx);
      addBot(`${ack}\n\n${qDisplay(QUESTIONS[nextIdx])}`);
    }
  }

  async function parseAnswer(q: Question, input: string): Promise<string | null> {
    setIsParsing(true);
    try {
      const res = await fetch("/api/onboarding-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: q.key, input }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { value?: unknown; region?: string | null };
      const { value, region } = data;

      if (
        value == null ||
        (Array.isArray(value) && (value as unknown[]).length === 0)
      ) {
        return null;
      }
      storeAnswer(q.key, value, region);
      return buildAck(q.key, value);
    } catch {
      return null;
    } finally {
      setIsParsing(false);
    }
  }

  function handleNullOrSkip(
    q: Question,
    isReview: boolean,
    rQueue: string[],
    curIdx: number,
    currentRetried: Set<string>,
  ) {
    const key = q.key;
    if (REQUIRED_KEYS.has(key) && !currentRetried.has(key)) {
      setRetriedKeys((prev) => new Set([...prev, key]));
      addBot(`${RETRY_MSG}\n\n${qDisplay(q)}`);
    } else {
      skipKey(key);
      advanceAfterKey(isReview, rQueue, curIdx, SKIP_ACK);
    }
  }

  async function handleSubmit(rawInput: string) {
    const input = rawInput.trim();
    if (!input || isParsing || isPending) return;

    // People 페이즈 — LLM 파싱 없이 raw input = 이름
    if (phase === "people") {
      await handlePeopleInput(input);
      return;
    }

    // 현재 컨텍스트 동기적으로 캡처
    const isReview = phase === "review";
    const rQueue = reviewQueue;
    const curIdx = qIdx;

    const q = isReview
      ? QUESTIONS.find((qq) => qq.key === rQueue[0])
      : QUESTIONS[curIdx];
    if (!q) return;

    addUser(input);
    setInputVal("");

    if (isSkipInput(input)) {
      handleNullOrSkip(q, isReview, rQueue, curIdx, retriedKeys);
      return;
    }

    const ack = await parseAnswer(q, input);
    if (ack === null) {
      handleNullOrSkip(q, isReview, rQueue, curIdx, retriedKeys);
      return;
    }
    advanceAfterKey(isReview, rQueue, curIdx, ack);
  }

  function handleSummaryChoice(choice: "now" | "later") {
    if (choice === "later") {
      addUser("나중에 할게요");
      addBot("알겠어요! 언제든 라이프북에서 더 알려주실 수 있어요. 😊");
      // setPhase 는 saveAndGoPeople 이 결정
      saveAndGoPeople();
    } else {
      addUser("지금 할게요");
      const skippedArr = Array.from(skippedRef.current);
      const queue = QUESTIONS.filter((q) => skippedArr.includes(q.key)).map(
        (q) => q.key,
      );
      setReviewQueue(queue);
      setPhase("review");
      const firstQ = QUESTIONS.find((q) => q.key === queue[0]);
      addBot("좋아요! 하나씩 다시 여쭤볼게요. 😊\n\n" + (firstQ ? qDisplay(firstQ) : ""));
    }
  }

  // 위젯에서 직접 값 제출 (LLM 파싱 불필요 경로).
  // 동기 함수 — 호출 시점의 phase/qIdx/reviewQueue 를 캡처.
  function handleDirectSubmit(value: unknown) {
    if (disabled) return;
    const isReview = phase === "review";
    const rQueue = reviewQueue;
    const curIdx = qIdx;
    const q = isReview ? QUESTIONS.find((qq) => qq.key === rQueue[0]) : QUESTIONS[curIdx];
    if (!q) return;

    const displayText = Array.isArray(value)
      ? (value as string[]).join(", ")
      : String(value);
    addUser(displayText);
    storeAnswer(q.key, value);
    advanceAfterKey(isReview, rQueue, curIdx, buildAck(q.key, value));
  }

  // 장소 매핑 포함 직접 제출 (residences·schools 전용).
  function handleDirectSubmitWithPlaces(names: string[], places: PlaceInfo[], key: string) {
    if (disabled) return;
    const isReview = phase === "review";
    const rQueue = reviewQueue;
    const curIdx = qIdx;
    const q = isReview ? QUESTIONS.find((qq) => qq.key === rQueue[0]) : QUESTIONS[curIdx];
    if (!q) return;

    const displayText = names.join(", ");
    addUser(displayText || "");
    storeAnswer(key, names);
    // 좌표가 있는 항목만 places 저장 (없으면 null 유지)
    const placesKey = key === "residences" ? "residencePlaces" : "schoolPlaces";
    const hasAnyCoord = places.some((p) => p.lat !== null);
    if (hasAnyCoord) {
      (answersRef.current as Record<string, unknown>)[placesKey] = places;
    }
    advanceAfterKey(isReview, rQueue, curIdx, buildAck(key, names));
  }

  const disabled = isParsing || isPending;
  const canSend = inputVal.trim().length > 0 && !disabled;
  const showInput = phase === "chat" || phase === "review" || phase === "people";
  const showSummaryBtns = phase === "summary";
  const inPeoplePhase = phase === "people";

  // 현재 질문 — 위젯 렌더에 사용
  const currentQ =
    phase === "review" && reviewQueue.length > 0
      ? QUESTIONS.find((q) => q.key === reviewQueue[0])
      : QUESTIONS[qIdx];

  // 질문 종류에 따른 위젯. key={currentQ.key} 로 질문 바뀌면 state 리셋.
  function renderWidget() {
    if (!showInput || !currentQ || inPeoplePhase) return null;
    switch (currentQ.kind) {
      case "year":
        return (
          <YearWidget
            key={currentQ.key}
            onSubmit={(y) => handleDirectSubmit(y)}
            disabled={disabled}
          />
        );
      case "chips":
        return (
          <ChipsWidget
            key={currentQ.key}
            onSubmit={handleDirectSubmit}
            disabled={disabled}
          />
        );
      case "textlist":
        // 거주지·학교는 장소 매핑 위젯 (지도에서 찾기 포함)
        if (currentQ.key === "residences" || currentQ.key === "schools") {
          return (
            <PlaceableMultiItemWidget
              key={currentQ.key}
              placeholder={currentQ.hint ?? "입력 후 추가 누르세요"}
              qKey={currentQ.key}
              onSubmit={handleDirectSubmitWithPlaces}
              disabled={disabled}
            />
          );
        }
        return (
          <MultiItemWidget
            key={currentQ.key}
            placeholder={currentQ.hint ?? "입력 후 추가 누르세요"}
            onSubmit={handleDirectSubmit}
            disabled={disabled}
          />
        );
      case "tags":
        return (
          <MultiItemWidget
            key={currentQ.key}
            placeholder="항목을 입력하고 추가를 누르세요"
            onSubmit={handleDirectSubmit}
            disabled={disabled}
          />
        );
      default:
        return null;
    }
  }

  const widget = renderWidget();

  return (
    <div className="flex h-screen flex-col bg-[var(--color-canvas)]">
      {/* 진행 표시 */}
      {phase === "chat" && (
        <div className="flex items-center border-b border-[var(--color-line)] px-4 py-3">
          <span className="text-sm font-medium text-[var(--color-ink)]">
            라이프북 시작하기
          </span>
          <span className="ml-auto text-sm text-[var(--color-ink-subtle)]">
            {qIdx + 1}&nbsp;/&nbsp;{QUESTIONS.length}
          </span>
        </div>
      )}

      {/* 채팅 영역 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "u" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={[
                "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[17px] leading-relaxed",
                m.role === "u"
                  ? "rounded-br-sm bg-[var(--color-action)] text-white"
                  : "rounded-bl-sm bg-white text-[var(--color-ink)] shadow-sm",
              ].join(" ")}
            >
              {m.text}
            </div>
          </div>
        ))}
        {isParsing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-[var(--color-ink-subtle)] shadow-sm">
              …
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 요약 선택 버튼 */}
      {showSummaryBtns && (
        <div className="flex gap-3 border-t border-[var(--color-line)] px-4 py-4">
          <button
            onClick={() => handleSummaryChoice("now")}
            disabled={isPending}
            className="flex-1 rounded-xl border border-[var(--color-brand)] py-3 text-[17px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 disabled:opacity-50"
          >
            지금 할게요
          </button>
          <button
            onClick={() => handleSummaryChoice("later")}
            disabled={isPending}
            className="flex-1 rounded-xl bg-[var(--color-action)] py-3 text-[17px] font-medium text-white disabled:opacity-50"
          >
            나중에 할게요
          </button>
        </div>
      )}

      {/* 입력 영역 (위젯 + 텍스트 입력 병행) */}
      {showInput && (
        <div className="border-t border-[var(--color-line)]">
          {/* 타입별 위젯 */}
          {widget && (
            <div className="px-4 pt-4 pb-2">
              {widget}
            </div>
          )}

          {/* 구분선 */}
          {widget && (
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 border-t border-[var(--color-line)]" />
              <span className="text-[13px] text-[var(--color-ink-subtle)]">또는 직접 입력</span>
              <div className="flex-1 border-t border-[var(--color-line)]" />
            </div>
          )}

          {/* 텍스트 입력 */}
          <div className="space-y-2 px-4 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(inputVal);
              }}
              className="flex gap-2"
            >
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={disabled}
                placeholder={inPeoplePhase ? "성함을 입력하세요…" : widget ? "직접 입력하셔도 돼요…" : "답변을 입력하세요…"}
                className="flex-1 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-[17px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-xl bg-[var(--color-action)] px-5 py-3 text-[17px] font-medium text-white disabled:opacity-40"
              >
                전송
              </button>
            </form>
            <button
              type="button"
              onClick={() => handleSubmit("넘어가기")}
              disabled={disabled}
              className="text-sm text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)] disabled:opacity-40"
            >
              {inPeoplePhase ? "이 분은 넘어가기 →" : "넘어가기 →"}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="border-t border-[var(--color-line)] px-4 py-4 text-center text-sm text-[var(--color-ink-subtle)]">
          {isPending ? "저장하는 중…" : "잠시만요…"}
        </div>
      )}
    </div>
  );
}
