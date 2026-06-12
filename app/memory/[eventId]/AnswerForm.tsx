"use client";

import { useEffect, useRef, useState } from "react";

import { submitMemoryAnswer } from "./actions";

// 추억 입력 폼(클라). 텍스트 + (지원 브라우저면) 음성 받아쓰기.
//
// Web Speech API 의 최소 타입. Chrome/Edge/최신 Safari 만 노출하며(Safari
// 는 webkitSpeechRecognition). 없으면 텍스트 전용으로 렌더하고 마이크
// 버튼은 아예 안 보여준다.

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  resultIndex: number;
};

type SpeechRecognitionErrorLike = { error: string };

function getRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AnswerForm({
  eventId,
  conversationId,
}: {
  eventId: string;
  conversationId: string;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceSupported(getRecognitionCtor() !== null);
    return () => {
      // 언마운트 시 정리 — 반쯤 열린 인식 세션이 새지 않도록.
      recognitionRef.current?.stop();
    };
  }, []);

  function startRecording() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setVoiceError(null);
    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let added = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          added += r[0].transcript;
        }
      }
      if (added) {
        setAnswer((prev) => (prev ? `${prev} ${added}` : added).trim());
      }
    };
    rec.onerror = (e) => {
      setVoiceError(
        e.error === "not-allowed"
          ? "마이크 사용 권한이 필요해요."
          : "녹음 중 문제가 생겼어요. 다시 시도해 주세요.",
      );
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error(err);
      setVoiceError("녹음을 시작할 수 없어요.");
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        setSubmitError(null);
        try {
          if (recording) stopRecording();
          await submitMemoryAnswer(formData);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("insufficient balance")) {
            setSubmitError(
              "토큰이 부족해요. 충전하시고 다시 시도해 주세요.",
            );
          } else {
            // Next.js 의 redirect() 는 특수 객체를 throw 한다 — 그대로
            // 전파시켜 네비게이션이 일어나게 한다.
            throw err;
          }
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="answer" className="text-lg font-semibold text-ink">
        떠오르는 대로 적어주세요
      </label>
      <textarea
        id="answer"
        name="answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        placeholder="기억나는 장면이나 느낌을 짧게 적어도 좋아요."
        className="w-full rounded-md border-2 border-line px-4 py-3 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      />

      {voiceSupported && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            aria-pressed={recording}
            aria-label={recording ? "녹음 멈추기" : "음성으로 말하기"}
            className={
              "flex items-center justify-center gap-3 self-start rounded-md border-2 px-6 py-4 text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
              (recording
                ? "border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
                : "border-line bg-surface text-ink hover:bg-banner")
            }
          >
            <span aria-hidden className="text-2xl">
              {recording ? "■" : "🎤"}
            </span>
            <span>{recording ? "녹음 멈추기" : "말로 답하기"}</span>
          </button>
          {recording && (
            <p className="text-base text-rose-700">
              듣고 있어요… 다 말씀하시면 멈추기를 누르세요.
            </p>
          )}
          {voiceError && (
            <p className="text-base text-rose-700">{voiceError}</p>
          )}
        </div>
      )}

      {submitError && (
        <p className="text-base text-amber-900">
          {submitError}{" "}
          <a href="/billing" className="font-semibold underline">
            충전하러 가기
          </a>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || answer.trim() === ""}
        className="self-end rounded-md bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {submitting ? "저장 중..." : "추억 남기기"}
      </button>
    </form>
  );
}
