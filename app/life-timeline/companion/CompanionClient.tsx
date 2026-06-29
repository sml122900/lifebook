"use client";

// 채팅 기반 회상 동반자 UI.
//
// 입력: 텍스트 타이핑 또는 🎤 탭 → STT → 텍스트 채워짐 → 사용자 확인/수정 후 전송.
// TTS: 토글 ON이면 speechSynthesis로 읽어줌(비블로킹), OFF면 텍스트만.
// 백엔드(/api/companion, STT, 세션 저장, audioPaths 누적)는 모두 그대로.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCompanionSessionAction } from "./actions";
import { EraArchiveCard, type EraSnapshot } from "./EraArchiveCard";
import { getEraCatalog } from "@/app/timemachine/[year]/[month]/era-pick-actions";
import type { EraEvent, EraSong } from "@/lib/era-events";
import { START_TOUR_EVENT } from "@/lib/tours";

type Phase = "opening" | "idle" | "recording" | "transcribing" | "thinking" | "error";
type ChatMessage = { role: "user" | "assistant"; content: string };
// C3 — 메시지에 그 시절 아카이브 카드(era)를 여러 개 매달 수 있다(연도별 1개).
type Msg = { role: "a" | "u"; text: string; eras?: EraSnapshot[] };

// 세션 안전 상한
const MAX_TURNS_CLIENT = 50;
const SESSION_MAX_MS = 30 * 60 * 1000; // 30분

// STT 폴링
const STT_POLL_INTERVAL_MS = 3_000;
const STT_MAX_POLLS = 30; // 최대 90초

// 침묵 감지
const SILENCE_THRESHOLD = 0.015;
const SILENCE_AUTO_STOP_MS = 10_000;
const SILENCE_CHECK_INTERVAL_MS = 200;

// TTS 프로바이더 — CLOVA 복귀 시 이 한 줄만 "clova" 로 교체
const TTS_PROVIDER: "browser" | "clova" = "browser";

const OPENING_TRIGGER =
  "[대화 시작] 어르신께 따뜻하게 인사하고 편하게 이야기를 시작할 첫 질문을 드려주세요.";
const OPENING_FALLBACK =
  "안녕하세요! 오늘 소중한 이야기 함께 나눠요. 어떤 기억부터 꺼내볼까요?";

type SttUploadResult = { ok: boolean; audioPath?: string; error?: string };
type SttSubmitResult = { ok: boolean; token?: string; error?: string };
type SttStatusResult = { ok: boolean; status?: string; text?: string; error?: string };
type CompanionResult = { reply?: string; error?: string };

// 브라우저 한국어 음성 선택 — onvoiceschanged 비동기 대응
function getKoreanVoice(): Promise<SpeechSynthesisVoice | null> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices.find((v) => v.lang.startsWith("ko")) ?? null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 2_000);
    speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer);
      resolve(speechSynthesis.getVoices().find((v) => v.lang.startsWith("ko")) ?? null);
    };
  });
}

// firstVisitTour: 이 화면 코치마크를 아직 안 본 사용자면 true → 오프닝 인사가
// 뜬 뒤(입력창 등장) 1회 자동으로 둘러보기를 띄운다(START_TOUR_EVENT).
export function CompanionClient({ firstVisitTour = false }: { firstVisitTour?: boolean }) {
  const router = useRouter();
  const tourFiredRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("opening");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [audioPaths, setAudioPaths] = useState<string[]>([]);
  const [ttsOn, setTtsOn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionEndReason, setSessionEndReason] = useState<"turns" | "time" | null>(null);

  // async 클로저에서 최신값 읽기
  const historyRef = useRef<ChatMessage[]>([]);
  historyRef.current = history;
  const ttsOnRef = useRef(false);
  ttsOnRef.current = ttsOn;

  // C3 — 시대 아카이브 카탈로그(1회 로드 후 클라 필터) + 이미 처리한 연도(중복 방지).
  const eraCatalogRef = useRef<{ events: EraEvent[]; songs: EraSong[] } | null>(null);
  const shownYearsRef = useRef<Set<number>>(new Set());

  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 새 메시지 → 스크롤 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 언마운트 정리
  useEffect(() => () => {
    cleanupAudio();
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
  }, []);

  // ── 헬퍼 ──────────────────────────────────────────────────────────────────

  function addBot(text: string) {
    setMessages((prev) => [...prev, { role: "a", text }]);
  }
  function addUser(text: string) {
    setMessages((prev) => [...prev, { role: "u", text }]);
  }

  // ── C3 그 시절 아카이브 ──────────────────────────────────────────────────
  // 카탈로그는 작아(사건 88·음악 73) 첫 연도 감지 때 1회만 받아 클라가 필터.
  async function ensureEraCatalog() {
    if (eraCatalogRef.current) return eraCatalogRef.current;
    try {
      const cat = await getEraCatalog();
      eraCatalogRef.current = { events: cat.events, songs: cat.songs };
      return eraCatalogRef.current;
    } catch {
      return null; // 조회 실패 시 카드 없이 대화 계속(차단 X).
    }
  }

  // 한 메시지에 카드 너무 많으면 답답 → 메시지당 상한.
  const MAX_ERA_CARDS_PER_MESSAGE = 2;

  // 텍스트에서 새 연도(1900~2099)를 모두 찾아 그 해 아카이브가 있으면 스냅샷 배열 반환.
  // 이미 처리한 연도·데이터 없는 연도는 제외. 대화당 연도별 1회, 메시지당 최대 2개.
  async function resolveEraSnapshots(text: string): Promise<EraSnapshot[]> {
    const re = /(?<!\d)(19\d{2}|20\d{2})(?!\d)/g;
    const candidates: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const y = Number(m[1]);
      if (!shownYearsRef.current.has(y) && !candidates.includes(y)) candidates.push(y);
    }
    if (candidates.length === 0) return [];

    const cat = await ensureEraCatalog();
    if (!cat) return [];

    const snapshots: EraSnapshot[] = [];
    for (const y of candidates) {
      shownYearsRef.current.add(y); // 데이터 유무와 무관하게 처리됨 표시(재검사 X).
      if (snapshots.length >= MAX_ERA_CARDS_PER_MESSAGE) continue;
      const events = cat.events.filter((e) => e.year === y);
      const songs = cat.songs.filter((s) => s.year === y);
      if (events.length === 0 && songs.length === 0) continue; // 아카이브 없음 → 카드 X.
      const ev = events.slice(0, 3).map((e) => ({ title: e.title }));
      const sg = songs
        .slice(0, Math.max(0, 5 - ev.length)) // 사건+노래 합쳐 최대 5개.
        .map((s) => ({ title: s.title, artist: s.artist }));
      snapshots.push({ year: y, events: ev, songs: sg });
    }
    return snapshots;
  }

  // 방금 추가된 마지막 동반자 메시지에 아카이브 카드들을 매단다(응답은 안 막음).
  function attachErasToLastBot(eras: EraSnapshot[]) {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "a") {
          const next = prev.slice();
          next[i] = { ...next[i], eras: [...(next[i].eras ?? []), ...eras] };
          return next;
        }
      }
      return prev;
    });
  }

  // 사용자 발화 + AI 응답에서 연도 감지 → 카드를 마지막 동반자 메시지에 비동기로.
  function detectEra(text: string) {
    void resolveEraSnapshots(text).then((eras) => {
      if (eras.length > 0) attachErasToLastBot(eras);
    });
  }

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

  function startSessionTimer() {
    if (sessionTimerRef.current) return;
    sessionTimerRef.current = setTimeout(() => {
      setSessionEndReason("time");
      if (mediaRecorderRef.current?.state === "recording") stopRecording();
    }, SESSION_MAX_MS);
  }

  // ── STT 파이프라인 ─────────────────────────────────────────────────────────

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

  // ── TTS (옵션) ─────────────────────────────────────────────────────────────

  async function speakText(text: string): Promise<void> {
    if (!ttsOnRef.current) return;

    if (TTS_PROVIDER === "browser") {
      const voice = await getKoreanVoice();
      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "ko-KR";
        if (voice) utter.voice = voice;
        utter.rate = 0.88;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        speechSynthesis.speak(utter);
      });
      return;
    }

    // CLOVA path — TTS_PROVIDER = "clova" 시 활성 (dormant)
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) { console.error("[companion/tts]", res.status); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
  }

  // ── Claude 동반자 ──────────────────────────────────────────────────────────

  async function callCompanion(
    message: string,
    currentHistory: ChatMessage[],
  ): Promise<string> {
    const res = await fetch("/api/companion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: currentHistory }),
    });
    const data: CompanionResult = await res.json();
    if (!data.reply) throw new Error(data.error ?? "동반자 응답 실패");
    return data.reply;
  }

  // ── 오프닝 (최초 1회) ─────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function runOpening() {
      let openingText = OPENING_FALLBACK;
      try {
        openingText = await callCompanion(OPENING_TRIGGER, []);
      } catch {
        // fallback 유지
      }
      if (!mounted) return;

      setHistory([
        { role: "user", content: OPENING_TRIGGER },
        { role: "assistant", content: openingText },
      ]);
      addBot(openingText);
      void speakText(openingText); // TTS 비블로킹 (토글 따름)
      detectEra(openingText); // C3 — 오프닝이 연도를 언급하면 아카이브 카드(드묾).

      startSessionTimer();
      setPhase("idle");

      // 첫 방문이면 입력창이 나타난 직후 코치마크 1회 자동(엔진은 ScreenTour 가
      // 마운트). 살짝 지연해 입력창(🎤·대화 마치기) 렌더 후 측정되게.
      if (firstVisitTour && !tourFiredRef.current) {
        tourFiredRef.current = true;
        setTimeout(() => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT)), 200);
      }
    }
    void runOpening();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 텍스트 전송 ───────────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || phase !== "idle" || sessionEndReason) return;

    setInputVal("");
    addUser(text);
    setPhase("thinking");

    try {
      const reply = await callCompanion(text, historyRef.current);
      const nextHistory: ChatMessage[] = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ];
      setHistory(nextHistory);
      addBot(reply);
      void speakText(reply); // TTS 비블로킹
      // 유료 채팅 차감 후 사이드 패널(루트 레이아웃) 잔액 갱신 (#1 배경 생성과 동일).
      router.refresh();
      // C3 — 사용자 발화 + AI 응답에서 연도 감지 → 그 시절 아카이브 카드(비블로킹).
      detectEra(`${text} ${reply}`);

      const turns = Math.floor(nextHistory.length / 2);
      if (turns >= MAX_TURNS_CLIENT) {
        setSessionEndReason("turns");
        return;
      }
      setPhase("idle");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "알 수 없는 오류가 생겼어요");
      setPhase("error");
    }
  }

  // ── 녹음 → STT → 입력창 채움 ──────────────────────────────────────────────

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

  async function processAudioToText(blob: Blob) {
    setPhase("transcribing");
    try {
      const audioPath = await uploadAudio(blob);
      setAudioPaths((prev) => [...prev, audioPath]);
      const token = await submitStt(audioPath);
      const transcript = await pollSttUntilDone(token);
      if (transcript.trim()) setInputVal(transcript.trim()); // 입력창 채움
    } catch (e) {
      console.error("[companion/stt]", e);
      // STT 실패 → idle 복귀 (대화 계속)
    } finally {
      setPhase("idle");
    }
  }

  async function handleStartRecording() {
    if (phase !== "idle") return;
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
        if (blob.size < 500) { setPhase("idle"); return; }
        void processAudioToText(blob);
      };
      mr.start(500);
      setPhase("recording");
    } catch {
      setErrorMsg("마이크 접근이 안 돼요. 설정에서 허용해주세요.");
      setPhase("error");
    }
  }

  function handleRetry() {
    setErrorMsg(null);
    setPhase("idle");
  }

  // ── 세션 종료 + 저장 ──────────────────────────────────────────────────────

  async function handleEndSession() {
    const hasContent = history.length > 2;
    if (!hasContent) { router.push("/life-timeline"); return; }
    setSaving(true);
    try {
      const result = await saveCompanionSessionAction({ history, audioPaths });
      if (result.ok) {
        router.push("/life-timeline/manage?draft=1");
      } else {
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

  // ── UI ────────────────────────────────────────────────────────────────────

  const isIdle = phase === "idle";
  const isRecording = phase === "recording";
  const isTranscribing = phase === "transcribing";
  const isThinking = phase === "thinking";
  const showInput =
    phase !== "opening" && phase !== "error" && !sessionEndReason;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* TTS 토글 */}
      <div className="flex items-center justify-end gap-2 pb-3 flex-shrink-0">
        <span className="text-sm text-ink-soft">소리로 듣기</span>
        <button
          onClick={() => setTtsOn((v) => !v)}
          className={[
            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
            ttsOn ? "bg-action" : "bg-line",
          ].join(" ")}
          aria-pressed={ttsOn}
          aria-label="TTS 켜기/끄기"
        >
          <span
            className={[
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
              ttsOn ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>

      {/* 메시지 목록 */}
      <div data-tour="companion-chat" className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-2">
        {/* 오프닝 로딩 */}
        {phase === "opening" && (
          <div className="flex justify-center py-12">
            <div
              className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand"
              aria-label="준비 중"
            />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div
              className={[
                "flex",
                msg.role === "u" ? "justify-end" : "justify-start",
              ].join(" ")}
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
            {/* C3 — 연도 감지 시 그 시절 아카이브 카드(접이식)를 메시지 아래에(연도별). */}
            {msg.eras?.map((era) => <EraArchiveCard key={era.year} era={era} />)}
          </div>
        ))}

        {/* thinking 점 애니메이션 */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-surface border border-line px-5 py-4">
              <div className="flex gap-1 items-center h-4">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 rounded-full bg-ink-soft animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 세션 상한 배너 */}
        {sessionEndReason && (
          <div className="rounded-xl bg-amber-50 px-6 py-4 text-center">
            <p className="text-lg font-semibold text-amber-900">
              {sessionEndReason === "turns"
                ? "오늘 정말 많은 이야기 해주셨어요!"
                : "30분이 됐어요. 오늘은 여기서 마무리할까요?"}
            </p>
            <p className="mt-1 text-sm text-amber-700">
              저장 후 이어서 새 대화를 시작하시면 이전 이야기를 기억해요.
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 에러 */}
      {phase === "error" && (
        <div className="py-3 text-center flex-shrink-0">
          <p className="text-base text-danger mb-2">{errorMsg}</p>
          <button
            onClick={handleRetry}
            className="rounded-xl bg-action px-6 py-2 text-base font-semibold text-white hover:bg-action-hover"
          >
            다시 해볼게요
          </button>
        </div>
      )}

      {/* 입력 영역 */}
      {showInput && (
        <div className="border-t border-line pt-3 flex-shrink-0">
          {/* 녹음/변환 상태 표시 */}
          {(isRecording || isTranscribing) && (
            <div className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
              {isRecording ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-danger flex-shrink-0" />
                  <span>녹음 중… 다시 누르면 종료해요</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 animate-spin rounded-full border-2 border-brand border-t-transparent flex-shrink-0" />
                  <span>음성 인식 중…</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* 텍스트 입력 */}
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!isIdle && !isTranscribing}
              placeholder={
                isRecording
                  ? "녹음 중이에요…"
                  : isTranscribing
                  ? "음성 인식 중이에요…"
                  : "이야기를 입력하거나 🎤 버튼을 눌러주세요 (Shift+Enter 줄바꿈)"
              }
              rows={2}
              className="flex-1 resize-none rounded-2xl border-2 border-line bg-canvas px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "9rem" }}
            />

            {/* 🎤 버튼 */}
            <button
              data-tour="companion-mic"
              onClick={isRecording ? stopRecording : handleStartRecording}
              disabled={!isIdle && !isRecording}
              className={[
                "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-xl transition-colors",
                isRecording
                  ? "bg-danger text-white animate-pulse"
                  : "bg-line text-ink hover:bg-ink-soft/20",
                !isIdle && !isRecording ? "opacity-40 cursor-not-allowed" : "",
              ].join(" ")}
              aria-label={isRecording ? "녹음 종료" : "음성 입력"}
            >
              {isRecording ? "■" : "🎤"}
            </button>

            {/* 전송 버튼 */}
            <button
              onClick={() => void handleSend()}
              disabled={!isIdle || !inputVal.trim()}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-action text-white text-2xl font-bold transition-colors hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="전송"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* 대화 마치기 */}
      {phase !== "opening" && (
        <div className="pt-3 text-center flex-shrink-0">
          {saving ? (
            <p className="text-base text-ink-soft">저장 중이에요…</p>
          ) : (
            <button
              data-tour="companion-end"
              onClick={handleEndSession}
              disabled={
                phase === "recording" ||
                phase === "thinking" ||
                phase === "transcribing"
              }
              className="min-h-[44px] rounded-xl border-2 border-line px-6 py-2 text-base font-semibold text-ink-soft hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              대화 마치기
            </button>
          )}
          {history.length > 2 && !saving && (
            <p className="mt-1 text-sm text-ink-soft">저장 후 검토·수정할 수 있어요</p>
          )}
        </div>
      )}
    </div>
  );
}
