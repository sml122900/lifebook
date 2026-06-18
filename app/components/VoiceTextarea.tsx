"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

// 음성으로 받아쓰는 textarea. Web Speech API (브라우저 STT) 만 사용 —
// AI 다듬기 + 토큰 차감은 Phase T4 에서 이 위에 얹는다.
//
// captureAudio=true 일 때 MediaRecorder 를 병행해 오디오 blob 도 캡처한다.
// prop 없으면 기존과 100% 동일(오디오 로직 미작동). 5개 사용처 중
// CategoryForm·EventForm·EraMemoryEditor 만 켬 — PersonForm 등은 무관.

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
  captureAudio = false,
  onAudioCaptured,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  textareaClassName?: string;
  onCleanup?: CleanupCallback;
  // opt-in 오디오 캡처 — prop 없으면 기존 동작 그대로.
  captureAudio?: boolean;
  onAudioCaptured?: (blob: Blob) => void;
}) {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // MediaRecorder — captureAudio=true 일 때만 사용.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // AI 다듬기 상태.
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setVoiceSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
      stopMediaRecorder();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMediaRecorder() {
    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch { /* ignore */ }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
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
      stopMediaRecorder();
    };
    rec.onend = () => {
      setRecording(false);
      // SpeechRecognition 이 끝나면(자동·수동 모두) MediaRecorder 도 정지.
      stopMediaRecorder();
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error("[voice-textarea] start failed", err);
      setVoiceError("녹음을 시작할 수 없어요.");
      return;
    }

    // MediaRecorder 병행 (captureAudio=true 일 때만). 실패해도 STT 는 그대로.
    if (captureAudio && onAudioCaptured) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: mr.mimeType || "audio/webm",
          });
          if (blob.size > 0) onAudioCaptured(blob);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
        mr.start();
        mediaRecorderRef.current = mr;
      } catch {
        // 권한 거부·미지원 — 무시하고 STT 만 동작
      }
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
    stopMediaRecorder();
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
          setCleanupNote(null);
        }}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={
          textareaClassName ??
          "w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
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
                  "flex items-center justify-center gap-3 min-h-[60px] rounded-md border-2 px-6 py-3 text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
                  (recording
                    ? "border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
                    : "border-brand bg-surface text-action hover:bg-banner")
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
                disabled={isPending || recording || value.trim() === ""}
                aria-label="AI 로 다듬기"
                className="flex items-center justify-center gap-3 min-h-[60px] rounded-md border-2 border-brand bg-banner px-6 py-3 text-lg font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <Link href="/billing" className="font-semibold underline">
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
