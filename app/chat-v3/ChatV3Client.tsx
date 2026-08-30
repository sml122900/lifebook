"use client";

// v3 통합 채팅(P2) — 신상 수집(뼈대모드) + STAGE2 확인질문 + 갭 기반 열린
// 대화가 하나의 채팅 흐름으로 이어진다. 내부 stage 는 UI 에 안 보인다.
//
// P1 대비 핵심 변화: 대화 로그를 DB(OnboardingChatMessage)에 저장/복원한다.
// 이 덕에 P1 의 sessionStorage 우회 가드(리마운트 시 잘못된 "지난번에
// 이어서" 분기 방지)는 완전히 걷어냈다 — 리마운트가 나도 저장된 로그를
// 그대로 다시 그리고, "다음에 뭘 물을지"는 항상 OnboardingProfile/LifeEvent
// 의 실제 상태에서 다시 계산한다(메시지 텍스트로 상태를 추측하지 않음).
//
// 재사용 엔진: completeOnboarding(onboarding.ts), getNextConfirmQuestion/
// submitConfirmAnswer/getConfirmQuestionForEvent(life-event.ts),
// continueEpisodeChat/finishEpisodeChat(episode.ts, STAGE4 그대로) — 전부
// 무수정 또는 순수 추가(getConfirmQuestionForEvent 신설).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

import { completeOnboarding } from "@/app/actions/onboarding";
import {
  hasOnboardingProfile,
  parseProfileBirthYear,
  parseProfileRegion,
} from "@/app/actions/onboarding-v3";
import {
  getConfirmedLifeEvent,
  getConfirmQuestionForEvent,
  getNextConfirmQuestion,
  submitConfirmAnswer,
} from "@/app/actions/life-event";
import { continueEpisodeChat, finishEpisodeChat, type EpisodeTurn } from "@/app/actions/episode";
import { getTopGaps } from "@/app/actions/gaps";
import { respondToOpenChat } from "@/app/actions/open-chat";
import {
  listRecentChatMessages,
  saveChatMessage,
  type ChatLogTurn,
} from "@/app/actions/chat-v3-log";
import type { Gap } from "@/lib/gap-detector";

type Msg = { role: "a" | "u"; text: string };
type Stage = "profile_year" | "profile_region" | "confirm" | "episode" | "open";
type Status = "loading" | "idle" | "submitting" | "finished" | "error";
type FinishReason = "done" | "capped" | "exited";

export type InitialGap = { eventId: string; kind: "confirm" | "episode" } | null;

// 피로도 제어 — 신상(생년·출생지) + 확인질문 합쳐 한 세션 상한. 갭 카드로
// 되돌아와 특정 이벤트를 다시 다루는 것(targeted confirm)·에피소드 대화·
// open 자유 대화는 이 상한에 안 걸린다(온보딩 피로도와는 다른 맥락).
const MAX_SESSION_QUESTIONS = 12;

// 종료 의사 키워드 사전 체크 — STAGE4(에피소드 대화)의 "종료 의사는 항상
// 즉시 존중" 원칙을 여기선 LLM 판단 대신 가벼운 키워드로 재현한다.
const EXIT_PHRASES = [
  "그만할래요",
  "그만할게요",
  "그만하고싶어요",
  "그만",
  "여기까지",
  "다음에할게요",
  "쉬고싶어요",
];

function isExitIntent(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return EXIT_PHRASES.some((p) => normalized.includes(p));
}

const OPEN_GREETING = "하고 싶은 이야기 있으세요?";

export function ChatV3Client({
  userId,
  initialGap,
}: {
  userId: string;
  initialGap: InitialGap;
}) {
  const router = useRouter();
  const [sessionId] = useState(() => crypto.randomUUID());

  const [stage, setStage] = useState<Stage>("profile_year");
  const [status, setStatus] = useState<Status>("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [gapSuggestions, setGapSuggestions] = useState<Gap[]>([]);

  const birthYearRef = useRef<number | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const questionCountRef = useRef(0);
  const isTargetedConfirmRef = useRef(false);
  const episodeFollowUpCountRef = useRef(0);
  const episodeTranscriptRef = useRef<EpisodeTurn[]>([]);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function addBot(text: string) {
    setMessages((prev) => [...prev, { role: "a", text }]);
    saveChatMessage(userId, sessionId, "assistant", text).catch((e) =>
      console.error("[chat-v3-log]", e),
    );
  }
  function addUser(text: string) {
    setMessages((prev) => [...prev, { role: "u", text }]);
    saveChatMessage(userId, sessionId, "user", text).catch((e) =>
      console.error("[chat-v3-log]", e),
    );
  }

  function enterError(message: string, retryAction: () => Promise<void>) {
    retryActionRef.current = retryAction;
    setErrorMsg(message);
    setStatus("error");
  }

  // canReview — /story-review 로 넘어갈 만한 상태인지(신상 단계에서 종료한
  // 경우엔 아직 아무 골격도 없어 보여줄 게 없다). "done"/"capped" 는 항상
  // confirm 루프(골격 존재) 안에서만 발생하므로 호출부가 true 로 고정.
  function finishSession(reason: FinishReason, canReview: boolean) {
    const msg =
      reason === "capped"
        ? "오늘은 여기까지 여쭤볼게요. 나머지는 다음에 이어서 여쭤볼게요."
        : reason === "exited"
          ? "네, 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요."
          : "뼈대가 다 채워졌어요! 지금까지 채운 이야기를 보여드릴게요.";
    addBot(msg);
    setStatus("finished");
    if (canReview) {
      setTimeout(() => router.push("/story-review"), 1200);
    }
  }

  // "open" 단계 진입/재진입 — 갭을 새로 계산해 보여주고, 인사말을 붙인다.
  // dedupeAgainst 가 주어지면(마운트 시 복원된 로그) 이미 같은 인사말로
  // 끝나 있는 경우 중복으로 또 안 붙인다.
  async function enterOpenStage(promptText: string, dedupeAgainst?: ChatLogTurn[]) {
    setStage("open");
    setStatus("loading");
    try {
      const gaps = await getTopGaps(userId, 3);
      setGapSuggestions(gaps);
      const last = dedupeAgainst?.[dedupeAgainst.length - 1];
      const alreadyShown = last?.role === "assistant" && last.content === promptText;
      if (!alreadyShown) addBot(promptText);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 불러오지 못했어요.", () => enterOpenStage(promptText, dedupeAgainst));
    }
  }

  async function loadNextConfirmQuestion(
    opts: { fromInit?: boolean; dedupeAgainst?: ChatLogTurn[] } = {},
  ) {
    const { fromInit = false, dedupeAgainst } = opts;
    setStage("confirm");
    setStatus("loading");
    try {
      if (questionCountRef.current >= MAX_SESSION_QUESTIONS) {
        finishSession("capped", true);
        return;
      }
      const res = await getNextConfirmQuestion(userId);
      if (res.done) {
        if (fromInit) {
          // 마운트 직후 만난 done:true 는 "지금 막 끝난" 게 아니라 "이미 다
          // 끝나 있었다" — 축하 멘트+리뷰 이동 대신 open 단계로.
          await enterOpenStage(OPEN_GREETING, dedupeAgainst);
        } else {
          finishSession("done", true);
        }
        return;
      }
      activeEventIdRef.current = res.eventId;
      questionCountRef.current += 1;
      addBot(res.question);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () =>
        loadNextConfirmQuestion({ fromInit, dedupeAgainst }),
      );
    }
  }

  async function afterConfirmResolved() {
    if (isTargetedConfirmRef.current) {
      isTargetedConfirmRef.current = false;
      await enterOpenStage("네, 반영했어요. 다른 이야기도 있으세요?");
    } else {
      await loadNextConfirmQuestion();
    }
  }

  // 갭 카드에서 특정(needsReview 포함) 이벤트를 골라 다시 묻는 경로.
  async function startTargetedConfirm(eventId: string) {
    isTargetedConfirmRef.current = true;
    setStage("confirm");
    setStatus("loading");
    try {
      const res = await getConfirmQuestionForEvent(userId, eventId);
      if (res.done) {
        isTargetedConfirmRef.current = false;
        await enterOpenStage("그 이야기는 이미 확인했나봐요. 다른 이야기 있으세요?");
        return;
      }
      activeEventIdRef.current = res.eventId;
      addBot(res.question);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () => startTargetedConfirm(eventId));
    }
  }

  // 갭 카드에서 confirmed 인데 hasEpisode=false 인 이벤트를 골라 심화 대화
  // 시작 — STAGE4(app/onboarding-episode-chat)와 같은 엔진, 같은 오프닝 톤.
  async function startEpisodeStage(eventId: string) {
    setStage("episode");
    setStatus("loading");
    try {
      const item = await getConfirmedLifeEvent(userId, eventId);
      if (!item) {
        await enterOpenStage("그 이야기는 지금 들을 수 없나봐요. 다른 이야기 있으세요?");
        return;
      }
      activeEventIdRef.current = item.id;
      episodeFollowUpCountRef.current = 0;
      const yearPart = item.year ? `${item.year}년 ` : "";
      const opening = `${yearPart}${item.label}, 이때 기억나는 거 있으세요? 편하게 말씀해주세요.`;
      episodeTranscriptRef.current = [{ role: "assistant", text: opening }];
      addBot(opening);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 준비하지 못했어요.", () => startEpisodeStage(eventId));
    }
  }

  async function submitEpisodeTurn(text: string) {
    const eventId = activeEventIdRef.current;
    if (!eventId) {
      setStatus("idle");
      return;
    }
    setStatus("submitting");
    const historyBefore = episodeTranscriptRef.current;
    const apiHistory: EpisodeTurn[] = [...historyBefore.slice(1), { role: "user", text }];
    try {
      const result = await continueEpisodeChat(eventId, apiHistory, episodeFollowUpCountRef.current);
      if (!result.ok) {
        enterError(result.error, () => {
          setStatus("idle");
          return Promise.resolve();
        });
        return;
      }
      episodeTranscriptRef.current = [
        ...historyBefore,
        { role: "user", text },
        { role: "assistant", text: result.reply },
      ];
      addBot(result.reply);
      episodeFollowUpCountRef.current += 1;
      if (result.end) {
        await finishEpisodeStage();
        return;
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => {
        setStatus("idle");
        return Promise.resolve();
      });
    }
  }

  async function finishEpisodeStage() {
    const eventId = activeEventIdRef.current;
    setStatus("loading");
    try {
      const result = eventId
        ? await finishEpisodeChat(eventId, episodeTranscriptRef.current)
        : { ok: false as const, error: "" };
      if (!result.ok) {
        addBot("저장하지 못했어요. 그래도 이야기 나눠주셔서 고마워요.");
      }
    } catch (e) {
      console.error("[chat-v3]", e);
      addBot("저장하지 못했어요. 그래도 이야기 나눠주셔서 고마워요.");
    }
    await enterOpenStage("소중한 이야기 들려주셔서 고마워요. 다른 이야기도 있으세요?");
  }

  async function submitBirthYear(text: string) {
    setStatus("submitting");
    try {
      const res = await parseProfileBirthYear(text);
      if (res.birthYear === null) {
        addBot("죄송해요, 잘 못 알아들었어요. 태어나신 연도를 다시 말씀해주시겠어요? (예: 1958년)");
        setStatus("idle");
        return;
      }
      birthYearRef.current = res.birthYear;
      addBot(`${res.birthYear}년에 태어나셨군요. 어디서 태어나셨어요?`);
      questionCountRef.current += 1;
      setStage("profile_region");
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => submitBirthYear(text));
    }
  }

  async function submitRegion(text: string) {
    setStatus("submitting");
    try {
      const res = await parseProfileRegion(text);
      if (res.region === null) {
        addBot("죄송해요, 잘 못 알아들었어요. 태어나거나 자란 곳을 다시 말씀해주시겠어요?");
        setStatus("idle");
        return;
      }
      const birthYear = birthYearRef.current;
      if (birthYear === null) {
        // 순서상 항상 birthYear 가 먼저 채워지므로 이론상 도달하지 않는다.
        setStage("profile_year");
        addBot("죄송해요, 처음부터 다시 여쭤볼게요. 언제 태어나셨어요?");
        setStatus("idle");
        return;
      }

      // 골격 생성 + 첫 확인질문 생성이 AI 호출 2연쇄로 이어져 몇 초 걸린다.
      setLoadingHint("잠깐만요, 이야기 칸을 정리하고 있어요…");
      await completeOnboarding(userId, {
        birthYear,
        birthMonth: null,
        gender: null,
        region: res.region,
      });
      // 직전 턴이 이미 "OO년에 태어나셨군요"였으니 여기서 연도를 또
      // 반복하지 않는다(중복 문구 픽스).
      addBot("네, 그럼 몇 가지 확인해볼게요.");
      await loadNextConfirmQuestion();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("저장하지 못했어요.", () => submitRegion(text));
    } finally {
      setLoadingHint(null);
    }
  }

  async function submitConfirmTurn(text: string) {
    const eventId = activeEventIdRef.current;
    if (!eventId) {
      setStatus("idle");
      return;
    }
    setStatus("submitting");
    try {
      const result = await submitConfirmAnswer(eventId, text);

      if (result.status === "UNCLEAR") {
        if (result.needsReview) {
          addBot("네, 그건 나중에 다시 여쭤볼게요.");
          await afterConfirmResolved();
        } else {
          addBot("죄송해요, 잘 못 알아들었어요. 다시 한번 말씀해주시겠어요?");
          setStatus("idle");
        }
        return;
      }

      if (result.status === "CONFIRMED") addBot("네, 확인했어요.");
      else if (result.status === "SKIPPED") addBot("알겠어요, 넘어갈게요.");
      else if (result.status === "CORRECTED") addBot("그렇게 고쳐서 담아둘게요.");

      await afterConfirmResolved();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 저장하지 못했어요.", () => submitConfirmTurn(text));
    }
  }

  async function submitOpenChat(text: string) {
    setStatus("submitting");
    try {
      const reply = await respondToOpenChat(userId, text);
      addBot(reply);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => submitOpenChat(text));
    }
  }

  async function init() {
    setStatus("loading");
    try {
      const loaded = await listRecentChatMessages(userId);
      if (loaded.length > 0) {
        setMessages(loaded.map((m) => ({ role: m.role === "assistant" ? "a" : "u", text: m.content })));
      }

      // 갭 카드에서 특정 이벤트를 지정해 돌아온 경우 — 자연 분기보다 우선.
      if (initialGap) {
        if (initialGap.kind === "episode") {
          await startEpisodeStage(initialGap.eventId);
        } else {
          await startTargetedConfirm(initialGap.eventId);
        }
        return;
      }

      const hasProfile = await hasOnboardingProfile(userId);
      if (!hasProfile) {
        setStage("profile_year");
        addBot("먼저 몇 가지만 여쭤볼게요. 언제 태어나셨어요?");
        questionCountRef.current += 1;
        setStatus("idle");
        return;
      }

      await loadNextConfirmQuestion({ fromInit: true, dedupeAgainst: loaded });
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("시작하지 못했어요.", init);
    }
  }

  const didInitRef = useRef(false);
  useEffect(() => {
    // dev StrictMode 가 마운트 이펙트를 두 번 실행 — 첫 질문이 중복 표시되는
    // 것을 막는다.
    if (didInitRef.current) return;
    didInitRef.current = true;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGapClick(gap: Gap) {
    if (status !== "idle") return;
    if (gap.type === "episode" && gap.targetEventId) {
      await startEpisodeStage(gap.targetEventId);
    } else if ((gap.type === "unconfirmed" || gap.type === "needs_review") && gap.targetEventId) {
      await startTargetedConfirm(gap.targetEventId);
    } else {
      // time_gap — 특정 이벤트가 없는 "사이" 제안. 프롬프트만 던지고
      // 자유 답변을 기다린다(구조화된 LifeEvent 생성은 이번 범위 아님).
      addBot(`${gap.label} 편하게 말씀해주세요.`);
    }
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || status !== "idle") return;

    if (isExitIntent(text)) {
      addUser(text);
      setInputVal("");
      const canReview = stage !== "profile_year" && stage !== "profile_region";
      finishSession("exited", canReview);
      return;
    }

    setInputVal("");
    addUser(text);

    if (stage === "profile_year") await submitBirthYear(text);
    else if (stage === "profile_region") await submitRegion(text);
    else if (stage === "confirm") await submitConfirmTurn(text);
    else if (stage === "episode") await submitEpisodeTurn(text);
    else await submitOpenChat(text);
  }

  function handleRetry() {
    setErrorMsg(null);
    const action = retryActionRef.current;
    if (action) void action();
  }

  const isIdle = status === "idle";
  const showInput = status !== "error" && status !== "finished";
  const showGaps = stage === "open" && isIdle && gapSuggestions.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={["flex", msg.role === "u" ? "justify-end" : "justify-start"].join(" ")}
          >
            <div
              className={[
                "max-w-[82%] rounded-2xl px-5 py-4 text-lg leading-relaxed whitespace-pre-wrap",
                msg.role === "u"
                  ? "bg-action text-white rounded-br-sm"
                  : "bg-surface border border-line text-ink rounded-bl-sm",
              ].join(" ")}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {(status === "loading" || status === "submitting") && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4">
              {loadingHint ? (
                <p className="text-base text-ink-soft">{loadingHint}</p>
              ) : (
                <div className="flex h-4 items-center gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-ink-soft"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showGaps && (
        <div className="flex flex-col gap-2">
          {gapSuggestions.map((gap, i) => (
            <button
              key={i}
              onClick={() => void handleGapClick(gap)}
              className="min-h-[56px] rounded-2xl border-2 border-line bg-surface px-5 py-3 text-left text-lg text-ink hover:bg-banner"
            >
              {gap.label}
            </button>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="py-2 text-center">
          <p className="mb-2 text-base text-danger">{errorMsg}</p>
          <Button variant="secondary" onClick={handleRetry}>
            다시 시도할게요
          </Button>
        </div>
      )}

      {showInput && (
        <div className="border-t border-line pt-3">
          <div className="flex items-end gap-2">
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!isIdle}
              placeholder="답을 입력해 주세요 (Shift+Enter 줄바꿈)"
              rows={2}
              className="flex-1 resize-none rounded-2xl border-2 border-line bg-canvas px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "9rem" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!isIdle || !inputVal.trim()}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-action text-white text-2xl font-bold transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="전송"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
