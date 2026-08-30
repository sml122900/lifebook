"use client";

// v3 통합 채팅(P1) — 신상 수집(뼈대모드) + STAGE2 확인질문을 하나의 채팅
// 흐름으로. 사용자에겐 단계 구분이 안 보이고, 내부 stage 상태로만 존재한다.
//
// 재사용: completeOnboarding(app/actions/onboarding.ts), getNextConfirmQuestion
// /submitConfirmAnswer(app/actions/life-event.ts) — 엔진 로직 무수정, 이
// 컴포넌트가 순서대로 이어붙인다. 시각 패턴은 app/onboarding-confirm/
// ConfirmClient.tsx 를 참고했다(말풍선·로딩 점·에러 배너 동일 톤).
//
// TODO(P2): status==="finished" 이후 정리화면(사진/장소/에피소드 등) 연결.
// 지금은 채팅 안에서 마무리 멘트만 보여주고 끝난다.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import { completeOnboarding } from "@/app/actions/onboarding";
import {
  hasOnboardingProfile,
  parseProfileBirthYear,
  parseProfileRegion,
} from "@/app/actions/onboarding-v3";
import {
  getNextConfirmQuestion,
  submitConfirmAnswer,
} from "@/app/actions/life-event";

type Msg = { role: "a" | "u"; text: string };
type Stage = "profile_year" | "profile_region" | "confirm";
type Status = "loading" | "idle" | "submitting" | "finished" | "error";

// 피로도 제어 — 신상(생년·출생지) + 확인질문 합쳐 한 세션 상한. 재질문(못
// 알아들어 다시 묻는 경우)은 새 질문이 아니라 카운트하지 않는다.
const MAX_SESSION_QUESTIONS = 12;

// 종료 의사 키워드 사전 체크 — STAGE4(에피소드 대화) 의 "종료 의사는 항상
// 즉시 존중" 원칙을 여기선 LLM 판단 대신 가벼운 키워드로 재현한다(매 턴
// AI 호출 없이 즉시 반응). "됐어요" 류는 "확인했다"는 긍정 답변과 겹칠 수
// 있어 일부러 뺐다 — 오탐(원치 않는 조기 종료)보다 놓치는 편이 안전하다.
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

export function ChatV3Client({ userId }: { userId: string }) {
  const [stage, setStage] = useState<Stage>("profile_year");
  const [status, setStatus] = useState<Status>("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const birthYearRef = useRef<number | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const questionCountRef = useRef(0);
  const resumedPrefixShownRef = useRef(false);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function addBot(text: string) {
    setMessages((prev) => [...prev, { role: "a", text }]);
  }
  function addUser(text: string) {
    setMessages((prev) => [...prev, { role: "u", text }]);
  }

  function enterError(message: string, retryAction: () => Promise<void>) {
    retryActionRef.current = retryAction;
    setErrorMsg(message);
    setStatus("error");
  }

  function finishSession(reason: "done" | "already_done" | "capped" | "exited") {
    const msg =
      reason === "already_done"
        ? "지난번에 확인을 다 마치셨어요! 오늘은 더 여쭤볼 게 없어요."
        : reason === "capped"
          ? "오늘은 여기까지 여쭤볼게요. 나머지는 다음에 이어서 여쭤볼게요."
          : reason === "exited"
            ? "네, 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요."
            : "뼈대가 다 채워졌어요! 오늘은 여기까지 할게요. 다음에 또 봬요.";
    addBot(msg);
    setStatus("finished");
  }

  async function loadNextConfirmQuestion(opts: { resuming?: boolean } = {}) {
    const { resuming = false } = opts;
    setStage("confirm");
    setStatus("loading");
    try {
      if (questionCountRef.current >= MAX_SESSION_QUESTIONS) {
        finishSession("capped");
        return;
      }
      const res = await getNextConfirmQuestion(userId);
      if (res.done) {
        finishSession(resuming ? "already_done" : "done");
        return;
      }
      activeEventIdRef.current = res.eventId;
      questionCountRef.current += 1;
      const prefix =
        resuming && !resumedPrefixShownRef.current ? "지난번에 이어서 할게요. " : "";
      resumedPrefixShownRef.current = true;
      addBot(prefix + res.question);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () => loadNextConfirmQuestion({ resuming }));
    }
  }

  async function init() {
    setStatus("loading");
    try {
      const hasProfile = await hasOnboardingProfile(userId);
      if (!hasProfile) {
        setStage("profile_year");
        addBot("먼저 몇 가지만 여쭤볼게요. 언제 태어나셨어요?");
        questionCountRef.current += 1;
        setStatus("idle");
        return;
      }
      await loadNextConfirmQuestion({ resuming: true });
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("시작하지 못했어요.", init);
    }
  }

  const didInitRef = useRef(false);
  useEffect(() => {
    // dev StrictMode 가 마운트 이펙트를 두 번 실행 — 첫 질문이 중복 표시되는
    // 것을 막는다(ConfirmClient 에는 없던 가드, 이 컴포넌트가 최초 메시지를
    // 이펙트 안에서 직접 addBot 하기 때문에 새로 필요해짐).
    if (didInitRef.current) return;
    didInitRef.current = true;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // 방어적으로 신상 처음부터.
        setStage("profile_year");
        addBot("죄송해요, 처음부터 다시 여쭤볼게요. 언제 태어나셨어요?");
        setStatus("idle");
        return;
      }
      await completeOnboarding(userId, {
        birthYear,
        birthMonth: null,
        gender: null,
        region: res.region,
      });
      addBot(`${birthYear}년에 태어나셨군요. 그럼 몇 가지 확인해볼게요.`);
      await loadNextConfirmQuestion();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("저장하지 못했어요.", () => submitRegion(text));
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
          await loadNextConfirmQuestion();
        } else {
          addBot("죄송해요, 잘 못 알아들었어요. 다시 한번 말씀해주시겠어요?");
          setStatus("idle");
        }
        return;
      }

      if (result.status === "CONFIRMED") addBot("네, 확인했어요.");
      else if (result.status === "SKIPPED") addBot("알겠어요, 넘어갈게요.");
      else if (result.status === "CORRECTED") addBot("그렇게 고쳐서 담아둘게요.");

      await loadNextConfirmQuestion();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 저장하지 못했어요.", () => submitConfirmTurn(text));
    }
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || status !== "idle") return;

    if (isExitIntent(text)) {
      addUser(text);
      setInputVal("");
      finishSession("exited");
      return;
    }

    setInputVal("");
    addUser(text);

    if (stage === "profile_year") await submitBirthYear(text);
    else if (stage === "profile_region") await submitRegion(text);
    else await submitConfirmTurn(text);
  }

  function handleRetry() {
    setErrorMsg(null);
    const action = retryActionRef.current;
    if (action) void action();
  }

  const isIdle = status === "idle";
  const showInput = status !== "error" && status !== "finished";

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
              <div className="flex h-4 items-center gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 animate-bounce rounded-full bg-ink-soft"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

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
