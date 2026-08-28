"use client";

// STAGE2 확인질문 채팅 UI. 텍스트 입력만(음성 입력은 후속).
//
// getNextConfirmQuestion → 질문 말풍선 표시 → 사용자 답 제출 →
// submitConfirmAnswer 분류 결과에 따라:
//   CONFIRMED/SKIPPED/CORRECTED → 짧은 확인 멘트 + 다음 질문
//   UNCLEAR(needsReview=false) → 같은 이벤트로 부드럽게 재질문
//   UNCLEAR(needsReview=true)  → 넘어간다는 멘트 + 다음 질문(더 안 물어봄)
// done:true → 완료 화면(STAGE3 연결은 TODO).

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import {
  getNextConfirmQuestion,
  submitConfirmAnswer,
} from "@/app/actions/life-event";

type Msg = { role: "a" | "u"; text: string };
type Phase = "loading" | "idle" | "submitting" | "done" | "error";

export function ConfirmClient({ userId }: { userId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeEventIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  function addBot(text: string) {
    setMessages((prev) => [...prev, { role: "a", text }]);
  }
  function addUser(text: string) {
    setMessages((prev) => [...prev, { role: "u", text }]);
  }

  async function loadNext() {
    setPhase("loading");
    try {
      const res = await getNextConfirmQuestion(userId);
      if (res.done) {
        activeEventIdRef.current = null;
        setPhase("done");
        return;
      }
      activeEventIdRef.current = res.eventId;
      addBot(res.question);
      setPhase("idle");
    } catch (e) {
      console.error("[onboarding-confirm]", e);
      setErrorMsg("질문을 불러오지 못했어요.");
      setPhase("error");
    }
  }

  useEffect(() => {
    void loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const text = inputVal.trim();
    const eventId = activeEventIdRef.current;
    if (!text || phase !== "idle" || !eventId) return;

    setInputVal("");
    addUser(text);
    setPhase("submitting");

    try {
      const result = await submitConfirmAnswer(eventId, text);

      if (result.status === "UNCLEAR") {
        if (result.needsReview) {
          addBot("네, 그건 나중에 다시 여쭤볼게요.");
          await loadNext();
        } else {
          addBot("죄송해요, 잘 못 알아들었어요. 다시 한번 말씀해주시겠어요?");
          setPhase("idle");
        }
        return;
      }

      if (result.status === "CONFIRMED") addBot("네, 확인했어요.");
      else if (result.status === "SKIPPED") addBot("알겠어요, 넘어갈게요.");
      else if (result.status === "CORRECTED") addBot("그렇게 고쳐서 담아둘게요.");
      // NOT_FOUND — 드묾(동시 삭제 등). 다음 질문으로 그냥 진행.

      await loadNext();
    } catch (e) {
      console.error("[onboarding-confirm]", e);
      setErrorMsg("답변을 저장하지 못했어요.");
      setPhase("error");
    }
  }

  function handleRetry() {
    setErrorMsg(null);
    void loadNext();
  }

  const isIdle = phase === "idle";

  if (phase === "done") {
    return (
      <div className="rounded-md border-2 border-line bg-surface p-6">
        <p className="text-xl font-semibold text-ink">
          여기까지 확인했어요. 이제 이야기를 들어볼게요.
        </p>
        {/* TODO(STAGE3): 확인 완료 후 액션 버튼 화면으로 연결 */}
      </div>
    );
  }

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

        {(phase === "loading" || phase === "submitting") && (
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

      {phase === "error" && (
        <div className="py-2 text-center">
          <p className="mb-2 text-base text-danger">{errorMsg}</p>
          <Button variant="secondary" onClick={handleRetry}>
            다시 시도할게요
          </Button>
        </div>
      )}

      {phase !== "error" && (
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
