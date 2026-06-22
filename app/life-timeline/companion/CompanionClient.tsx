"use client";

// 음성 회상 동반자 루프 UI.
//
// 루프: 동반자 오프닝(TTS) → 어르신 발화(토글 녹음) → STT → /api/companion → /api/tts → 재생 → 반복
// Decision A: 탭 토글 (누르고 있기 X) + 10초 침묵 자동 종료 (안전망)
// Decision D: 각 턴 audioPath 를 audioPaths 배열에 누적 → 세션 저장 시 영구 보존

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveCompanionSessionAction } from "./actions";

type Phase = "opening" | "idle" | "recording" | "processing" | "playing" | "error";
type ChatMessage = { role: "user" | "assistant"; content: string };

// 침묵 감지 설정
const SILENCE_THRESHOLD = 0.015; // RMS 기준. 속삭임~조용한 방 배경음 구분
const SILENCE_AUTO_STOP_MS = 10_000; // 10초 침묵 → 자동 종료
const SILENCE_CHECK_INTERVAL_MS = 200;

// 세션 안전 상한
const MAX_TURNS_CLIENT = 50; // 50턴 = history 100개 (오프닝 1턴 포함). 도달 시 자동 저장.
const SESSION_MAX_MS = 40 * 60 * 1000; // 40분 — 어르신 장시간 세션 안전망

// STT 폴링 설정
const STT_POLL_INTERVAL_MS = 3_000;
const STT_MAX_POLLS = 30; // 최대 90초 대기

// 동반자 오프닝 트리거 — v1 시스템 프롬프트가 적절한 인사+첫 질문을 생성함
const OPENING_TRIGGER =
  "[대화 시작] 어르신께 따뜻하게 인사하고 편하게 이야기를 시작할 첫 질문을 드려주세요.";
const OPENING_FALLBACK =
  "안녕하세요! 오늘 소중한 이야기 함께 나눠요. 어떤 기억부터 꺼내볼까요?";

// ── 타입 ────────────────────────────────────────────────────────────────────

type SttUploadResult = { ok: boolean; audioPath?: string; error?: string };
type SttSubmitResult = { ok: boolean; token?: string; error?: string };
type SttStatusResult = { ok: boolean; status?: string; text?: string; error?: string };
type CompanionResult = { reply?: string; error?: string };

// ── CompanionClient ────────────────────────────────────────────────────────

export function CompanionClient() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("opening");
  const [statusText, setStatusText] = useState("잠깐만요, 인사 준비 중이에요...");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [audioPaths, setAudioPaths] = useState<string[]>([]); // Decision D용 누적
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionEndReason, setSessionEndReason] = useState<"turns" | "time" | null>(null);

  // 각 렌더의 history 를 ref 에 동기화 — async 클로저에서 최신값 읽기
  const historyRef = useRef<ChatMessage[]>([]);
  historyRef.current = history;

  // 세션 타이머 (40분 상한)
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MediaRecorder 관련 refs (컴포넌트 생애 동안 변하지 않음)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 정리 헬퍼 ──────────────────────────────────────────────────────────

  function clearSilenceInterval() {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
  }

  function cleanupAudio() {
    clearSilenceInterval();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  // 언마운트 시 마이크·AudioContext + 세션 타이머 정리
  useEffect(() => () => {
    cleanupAudio();
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
  }, []);

  // 세션 시간 상한 — 오프닝 완료 직후 타이머 시작 (opening 단계에서 호출)
  function startSessionTimer() {
    if (sessionTimerRef.current) return; // 중복 방지
    sessionTimerRef.current = setTimeout(() => {
      setSessionEndReason("time");
      // 녹음 중이면 즉시 종료
      if (mediaRecorderRef.current?.state === "recording") stopRecording();
    }, SESSION_MAX_MS);
  }

  // ── STT 파이프라인 (/api/clova-stt 재사용) ─────────────────────────────

  async function uploadAudio(blob: Blob): Promise<string> {
    const fd = new FormData();
    fd.append("file", blob, "audio.webm");
    fd.append("mimeType", blob.type || "audio/webm");
    const res = await fetch("/api/clova-stt/upload", { method: "POST", body: fd });
    const data: SttUploadResult = await res.json();
    if (!data.ok || !data.audioPath) throw new Error(data.error ?? "업로드 실패");
    return data.audioPath;
  }

  async function submitStt(audioPath: string): Promise<string> {
    const res = await fetch("/api/clova-stt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioPath }),
    });
    const data: SttSubmitResult = await res.json();
    if (!data.ok || !data.token) throw new Error(data.error ?? "STT 제출 실패");
    return data.token;
  }

  async function pollSttUntilDone(token: string): Promise<string> {
    for (let i = 0; i < STT_MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, STT_POLL_INTERVAL_MS));
      const res = await fetch(`/api/clova-stt/status?token=${encodeURIComponent(token)}`);
      const data: SttStatusResult = await res.json();
      if (data.status === "COMPLETED") return data.text ?? "";
      if (data.status === "FAILED") throw new Error("음성 인식에 실패했어요");
    }
    throw new Error("음성 인식 시간이 너무 오래 걸려요");
  }

  // ── TTS (/api/tts) ─────────────────────────────────────────────────────

  async function speakText(text: string): Promise<void> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // TTS 실패해도 대화는 계속 — 재생만 건너뜀
      console.error("[companion/tts]", res.status);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); }; // 재생 실패도 흘려보냄
      audio.play().catch(() => resolve());
    });
  }

  // ── Claude (/api/companion) ─────────────────────────────────────────────

  async function callCompanion(message: string, currentHistory: ChatMessage[]): Promise<string> {
    const res = await fetch("/api/companion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: currentHistory }),
    });
    const data: CompanionResult = await res.json();
    if (!data.reply) throw new Error(data.error ?? "동반자 응답 실패");
    return data.reply;
  }

  // ── 오프닝 (최초 1회) ──────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function runOpening() {
      setPhase("opening");
      setStatusText("잠깐만요, 인사 준비 중이에요...");

      let openingText = OPENING_FALLBACK;
      try {
        openingText = await callCompanion(OPENING_TRIGGER, []);
      } catch {
        // TTS fallback 그대로 사용
      }
      if (!mounted) return;

      // 오프닝 텍스트를 history 의 첫 항목으로 기록 (이후 턴 컨텍스트)
      const openingHistory: ChatMessage[] = [
        { role: "user", content: OPENING_TRIGGER },
        { role: "assistant", content: openingText },
      ];
      setHistory(openingHistory);

      setPhase("playing");
      setStatusText("(말하는 중...)");
      await speakText(openingText);

      if (!mounted) return;
      startSessionTimer(); // 오프닝 완료 = 세션 시작, 40분 타이머 가동
      setPhase("idle");
      setStatusText("");
    }

    void runOpening();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 오디오 처리 파이프라인 ─────────────────────────────────────────────

  async function processAudio(blob: Blob) {
    setPhase("processing");
    setStatusText("잠깐만요, 생각하고 있어요...");

    try {
      // 1. Supabase 업로드 (Decision D: 경로 보관)
      const audioPath = await uploadAudio(blob);
      setAudioPaths((prev) => [...prev, audioPath]);

      // 2. CLOVA STT 제출 + 폴링
      const token = await submitStt(audioPath);
      const transcript = await pollSttUntilDone(token);

      if (!transcript.trim()) {
        // STT 결과 없음 → 조용히 idle 복귀
        setPhase("idle");
        setStatusText("");
        return;
      }

      // 3. Claude 동반자 호출 (최신 history 는 ref 에서)
      const reply = await callCompanion(transcript, historyRef.current);

      // 4. history 업데이트
      const nextHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "user", content: transcript },
        { role: "assistant", content: reply },
      ];
      setHistory(nextHistory);

      // 5. TTS 재생
      setPhase("playing");
      setStatusText("(말하는 중...)");
      await speakText(reply);

      // 턴 상한 도달 시 자동 저장 유도 (오프닝 포함 50턴 = history 100개)
      const turns = Math.floor(nextHistory.length / 2);
      if (turns >= MAX_TURNS_CLIENT) {
        setSessionEndReason("turns");
        return; // idle 진입 X — UI 가 저장 유도 메시지 표시
      }

      setPhase("idle");
      setStatusText("");
    } catch (e) {
      cleanupAudio();
      setErrorMsg(e instanceof Error ? e.message : "알 수 없는 오류가 생겼어요");
      setPhase("error");
    }
  }

  // ── 녹음 제어 ──────────────────────────────────────────────────────────

  function setupSilenceDetection(stream: MediaStream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CtxClass = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx: AudioContext = new CtxClass();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const data = new Float32Array(analyser.frequencyBinCount);
    let silenceMs = 0;

    silenceIntervalRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms < SILENCE_THRESHOLD) {
        silenceMs += SILENCE_CHECK_INTERVAL_MS;
        if (silenceMs >= SILENCE_AUTO_STOP_MS) stopRecording();
      } else {
        silenceMs = 0;
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }

  function stopRecording() {
    clearSilenceInterval();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleStartRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setupSilenceDetection(stream);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        cleanupAudio();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 500) {
          // 너무 짧음 → 조용히 idle 복귀
          setPhase("idle");
          setStatusText("");
          return;
        }
        void processAudio(blob);
      };

      mr.start(500); // 500ms 청크 단위 수집
      setPhase("recording");
      setStatusText("듣고 있어요...");
    } catch {
      setErrorMsg("마이크 접근이 안 돼요. 설정에서 허용해주세요.");
      setPhase("error");
    }
  }

  function handleRetry() {
    setErrorMsg(null);
    setPhase("idle");
    setStatusText("");
  }

  // ── 세션 종료 + 저장 ───────────────────────────────────────────────────

  async function handleEndSession() {
    const hasContent = history.length > 2; // 오프닝 2개 이상 = 어르신 발화 있음
    if (!hasContent) {
      // 대화 내용 없이 종료 → 그냥 뒤로
      router.push("/life-timeline");
      return;
    }

    setSaving(true);
    try {
      const result = await saveCompanionSessionAction({
        history,
        audioPaths,
      });

      if (result.ok) {
        router.push("/life-timeline/manage?draft=1");
      } else {
        // 저장 실패 → 에러 표시 후 재시도 가능
        setErrorMsg(result.error ?? "저장에 실패했어요");
        setPhase("error");
      }
    } catch {
      setErrorMsg("저장 중 오류가 생겼어요");
      setPhase("error");
    } finally {
      setSaving(false);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  const isIdle = phase === "idle";
  const isRecording = phase === "recording";
  const isBusy = phase === "opening" || phase === "processing" || phase === "playing";

  return (
    <div className="flex flex-col items-center gap-10">
      {/* 상태 텍스트 (크고 명확하게 — 어르신 헷갈림 방지) */}
      <div className="min-h-[3rem] text-center">
        {statusText && (
          <p className="text-2xl font-semibold text-ink">{statusText}</p>
        )}
        {isRecording && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-danger" />
            <span className="text-lg text-ink-soft">
              말씀이 끝나시면 아래 버튼을 눌러주세요
            </span>
          </div>
        )}
      </div>

      {/* 처리 중 스피너 */}
      {isBusy && (
        <div
          className="h-14 w-14 animate-spin rounded-full border-4 border-line border-t-brand"
          role="status"
          aria-label="처리 중"
        />
      )}

      {/* 턴·시간 상한 도달 — 저장 유도 배너 */}
      {sessionEndReason && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-amber-50 px-6 py-4 text-center">
          <p className="text-xl font-semibold text-amber-900">
            {sessionEndReason === "turns"
              ? "오늘 정말 많은 이야기 해주셨어요!"
              : "40분이 됐어요. 오늘은 여기서 마무리할까요?"}
          </p>
          <p className="text-base text-amber-700">
            저장 후 이어서 새 대화를 시작하시면 이전 이야기를 기억해요.
          </p>
        </div>
      )}

      {/* 메인 버튼 — idle: 이야기하기 / recording: 다 했어요 */}
      {!sessionEndReason && (isIdle || isRecording) && (
        <button
          onClick={isIdle ? handleStartRecording : stopRecording}
          className={[
            "flex h-24 w-72 items-center justify-center gap-3 rounded-2xl",
            "text-2xl font-bold text-white transition-colors active:scale-95",
            isRecording
              ? "bg-danger hover:bg-red-700"
              : "bg-action hover:bg-action-hover",
          ].join(" ")}
          aria-label={isIdle ? "이야기 시작하기" : "녹음 종료하기"}
        >
          <span aria-hidden="true">{isIdle ? "🎤" : "✓"}</span>
          {isIdle ? "이야기하기" : "다 했어요"}
        </button>
      )}

      {/* 에러 상태 */}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-xl font-semibold text-ink">잠깐 문제가 생겼어요</p>
          <p className="text-lg text-ink-soft">{errorMsg}</p>
          <button
            onClick={handleRetry}
            className="h-16 w-64 rounded-2xl bg-action text-xl font-bold text-white hover:bg-action-hover active:scale-95"
          >
            다시 해볼게요
          </button>
        </div>
      )}

      {/* 대화 마치기 — 오프닝 완료 후 항상 노출 (저장 → /manage?draft=1) */}
      {phase !== "opening" && (
        <div className="mt-2 border-t border-line pt-6 text-center">
          {saving ? (
            <p className="text-lg text-ink-soft">저장 중이에요...</p>
          ) : (
            <button
              onClick={handleEndSession}
              disabled={phase === "recording" || phase === "processing"}
              className="min-h-[48px] rounded-xl border-2 border-line bg-surface px-8 py-3 text-lg font-semibold text-ink-soft hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              대화 마치기
            </button>
          )}
          {history.length > 2 && !saving && (
            <p className="mt-2 text-sm text-ink-soft">
              저장 후 검토·수정할 수 있어요
            </p>
          )}
        </div>
      )}
    </div>
  );
}
