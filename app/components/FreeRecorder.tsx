"use client";

import { useEffect, useRef, useState } from "react";

import { STT_MAX_DURATION_SEC } from "@/lib/stt-cost";

// Phase 10 — MediaRecorder 전용 컴포넌트. Web Speech API 없이 통녹음만.
// VoiceTextarea 와 달리 transcript 변환은 서버(CLOVA) 에 위임.
//
// 사용법: <FreeRecorder onCapture={(blob, mime, durationSec) => ...} />
// 56px 버튼, 18px 텍스트 — 시니어 접근성.
// STT_MAX_DURATION_SEC(90분) 도달 시 자동 정지.

export function FreeRecorder({
  onCapture,
  disabled = false,
}: {
  onCapture: (blob: Blob, mimeType: string, durationSec: number) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsed, setElapsed] = useState(0);          // 녹음 경과 초
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const capturedBlobRef = useRef<Blob | null>(null);
  const capturedMimeRef = useRef<string>("audio/webm");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 언마운트 시 스트림 정리
  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
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
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    capturedBlobRef.current = null;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream);
      capturedMimeRef.current = mr.mimeType || "audio/webm";
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: capturedMimeRef.current });
        capturedBlobRef.current = blob;
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setState("recorded");
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      // 90분 자동 정지는 아래 useEffect 에서 elapsed 를 감시해 처리.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
          ? "마이크 사용 권한이 필요해요. 브라우저 주소창 왼쪽 자물쇠 아이콘을 눌러 허용해 주세요."
          : "녹음을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  // 90분 도달 시 자동 정지
  useEffect(() => {
    if (state !== "recording" || elapsed < STT_MAX_DURATION_SEC) return;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, state]);

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleSend() {
    const blob = capturedBlobRef.current;
    if (!blob || blob.size === 0) return;
    onCapture(blob, capturedMimeRef.current, elapsed);
  }

  function handleRetry() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    capturedBlobRef.current = null;
    setElapsed(0);
    setState("idle");
    setError(null);
  }

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  const remaining = STT_MAX_DURATION_SEC - elapsed;
  const nearLimit = state === "recording" && remaining <= 5 * 60 && remaining > 0;

  return (
    <div className="flex flex-col gap-4">
      {state === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          aria-label="녹음 시작"
          className="flex min-h-[56px] items-center justify-center gap-3 rounded-md bg-rose-600 px-6 text-lg font-semibold text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden className="text-2xl">●</span>
          <span>녹음 시작</span>
        </button>
      )}

      {state === "recording" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md bg-rose-50 px-5 py-3 text-rose-700">
            <span aria-hidden className="animate-pulse text-xl">●</span>
            <span className="text-lg font-semibold">녹음 중 {fmtTime(elapsed)}</span>
            <span className="ml-auto text-base text-rose-500">최대 90분</span>
          </div>
          {nearLimit && (
            <p className="text-base text-amber-700" role="alert">
              곧 자동으로 멈춰요 (남은 시간 {fmtTime(remaining)}).
            </p>
          )}
          <button
            type="button"
            onClick={stopRecording}
            aria-label="녹음 멈추기"
            className="flex min-h-[56px] items-center justify-center gap-3 rounded-md border-2 border-rose-600 px-6 text-lg font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <span aria-hidden className="text-xl">■</span>
            <span>녹음 멈추기</span>
          </button>
        </div>
      )}

      {state === "recorded" && previewUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink-soft">
            녹음이 끝났어요. 들어보시고 괜찮으면 전사 시작을 눌러주세요.
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled}
              className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-md bg-action px-6 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전사 시작
            </button>
            <button
              type="button"
              onClick={handleRetry}
              disabled={disabled}
              className="flex min-h-[56px] items-center justify-center rounded-md border-2 border-line px-6 text-lg font-semibold text-ink hover:bg-surface focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              다시 녹음
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-base text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
