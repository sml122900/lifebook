"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

// 음성으로 받아쓰는 textarea. Web Speech API (브라우저 STT) 만 사용 —
// AI 다듬기 + 토큰 차감은 Phase T4 에서 이 위에 얹는다.
//
// 패턴은 app/memory/[eventId]/AnswerForm.tsx 와 동일 (시니어 친화: 큰
// 버튼, 상태 명확, 녹음 중 빨강). Chrome/Edge/최신 Safari 만 지원하니
// 미지원 브라우저에선 마이크 버튼을 아예 안 보여준다.

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

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// onCleanup 이 제공되면 "AI 로 다듬기" 버튼이 함께 나타남. T4 에서
// 추가된 옵션 — 기본 STT 동작은 onCleanup 없이도 그대로 작동.
export type CleanupCallback = (text: string) => Promise<{
  cleaned: string;
  tokensSpent: number;
  balanceAfter: number;
}>;

export function VoiceTextarea({
  value,
  onChange,
  rows = 6,
  placeholder,
  ariaLabel,
  textareaClassName,
  onCleanup,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  textareaClassName?: string;
  onCleanup?: CleanupCallback;
}) {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // AI 다듬기 상태.
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setVoiceSupported(getRecognitionCtor() !== null);
    return () => {
      // 컴포넌트 unmount 시 열려있는 인식 세션 정리.
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
        if (r.isFinal) added += r[0].transcript;
      }
      if (added) {
        // 기존 텍스트 뒤에 이어붙임 (사용자가 타이핑하던 것 보존).
        const prev = valueRef.current;
        onChange((prev ? `${prev} ${added}` : added).trim());
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
      console.error("[voice-textarea] start failed", err);
      setVoiceError("녹음을 시작할 수 없어요.");
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  function handleCleanup() {
    if (!onCleanup) return;
    if (value.trim() === "") return;
    if (recording) stopRecording();
    setCleanupError(null);
    setCleanupNote(null);
    setInsufficient(false);
    startTransition(async () => {
      try {
        const result = await onCleanup(value);
        onChange(result.cleaned);
        // H2 — 다듬기 결과가 원문과 같으면 차감도 0. UX 안내도 분기.
        if (result.tokensSpent === 0) {
          setCleanupNote("이미 정돈된 문장이라 토큰을 쓰지 않았어요.");
        } else {
          setCleanupNote(
            `토큰 ${result.tokensSpent}개 사용 · 남은 ${result.balanceAfter.toLocaleString()}개`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("insufficient balance")) {
          setInsufficient(true);
          setCleanupError("토큰이 부족해요.");
        } else {
          console.error("[voice-cleanup]", err);
          setCleanupError("다듬기를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // 사용자가 손대면 직전 다듬기 안내는 무효화.
          setCleanupNote(null);
        }}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={
          textareaClassName ??
          "w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        }
      />

      {(voiceSupported || onCleanup) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {voiceSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                aria-pressed={recording}
                aria-label={recording ? "녹음 멈추기" : "음성으로 말하기"}
                disabled={isPending}
                className={
                  "flex items-center justify-center gap-3 min-h-[60px] rounded-md border-2 px-6 py-3 text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
                  (recording
                    ? "border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
                    : "border-zinc-400 bg-white text-zinc-900 hover:bg-zinc-100")
                }
              >
                <span aria-hidden className="text-2xl">
                  {recording ? "■" : "🎤"}
                </span>
                <span>{recording ? "녹음 멈추기" : "말로 적기"}</span>
              </button>
            )}

            {onCleanup && (
              <button
                type="button"
                onClick={handleCleanup}
                disabled={
                  isPending || recording || value.trim() === ""
                }
                aria-label="AI 로 다듬기"
                className="flex items-center justify-center gap-3 min-h-[60px] rounded-md border-2 border-violet-500 bg-violet-50 px-6 py-3 text-lg font-semibold text-violet-900 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden className="text-xl">✨</span>
                <span>{isPending ? "다듬는 중…" : "AI 로 다듬기"}</span>
              </button>
            )}
          </div>

          {recording && (
            <p className="text-base text-rose-700">
              듣고 있어요… 다 말씀하시면 멈추기를 누르세요.
            </p>
          )}
          {voiceError && (
            <p className="text-base text-rose-700" role="alert">
              {voiceError}
            </p>
          )}
          {cleanupNote && (
            <p className="text-base text-emerald-700" aria-live="polite">
              다듬었어요 · {cleanupNote}
            </p>
          )}
          {cleanupError && (
            <p className="text-base text-rose-700" role="alert">
              {cleanupError}
              {insufficient && (
                <>
                  {" "}
                  <Link
                    href="/billing"
                    className="font-semibold underline"
                  >
                    충전하러 가기
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
