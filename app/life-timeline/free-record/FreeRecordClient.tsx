"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FreeRecorder } from "@/app/components/FreeRecorder";
import { saveFreeRecordingAction } from "./actions";

// Phase 1 물꼬 목록 — AI 자동 생성은 Phase 2.
const TOPICS = [
  { key: "first_job", title: "처음 직장을 구하던 때" },
  { key: "school_memory", title: "학창시절 가장 기억에 남는 순간" },
  { key: "family_milestone", title: "가족과 함께한 특별한 날" },
  { key: "hometown", title: "고향과 어린 시절" },
  { key: "turning_point", title: "인생의 전환점이 된 일" },
  { key: "free", title: "그냥 하고 싶은 이야기" },
] as const;

type Phase =
  | "topic"        // 물꼬 선택
  | "record"       // 녹음
  | "uploading"    // Supabase 업로드 중
  | "processing"   // CLOVA STT 폴링 중
  | "review"       // 전사 결과 + Claude 정리본 검토
  | "saving"       // 저장 중
  | "done";        // 완료

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_TRIES = 60; // 4초 × 60 = 4분

export function FreeRecordClient({ userId }: { userId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("topic");
  const [saving, setSaving] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<(typeof TOPICS)[number] | null>(null);
  const [status, setStatus] = useState("");          // 사용자용 상태 메시지
  const [transcript, setTranscript] = useState("");  // STT 원본
  const [refined, setRefined] = useState("");        // Claude 정리본 (수정 가능)
  const [audioPath, setAudioPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── 녹음 완료 → 업로드 → CLOVA 제출 → 폴링 → Claude 정리 ──
  async function handleCapture(blob: Blob, mimeType: string) {
    if (!selectedTopic) return;
    setError(null);
    setPhase("uploading");
    setStatus("녹음 파일을 저장하는 중이에요…");

    try {
      // 1. Supabase 업로드 (임시 memoryId = UUID 대용으로 timestamp 사용)
      const tmpId = `tmp_${Date.now()}`;
      const formData = new FormData();
      formData.append("file", blob, `recording.webm`);
      formData.append("memoryId", tmpId);   // recordings 버킷은 memoryId 경로 사용
      // /api/recordings 는 memoryId 소유권을 UserMemory DB 에서 확인함 →
      // tmp_id 로는 실패. 직접 업로드 경로로 우회.
      // → 대신 클라에서 직접 버킷 업로드 대신 multipart 로 서버 전달
      const uploadRes = await uploadAudioDirect(userId, tmpId, blob, mimeType);
      if (!uploadRes.ok || !uploadRes.audioPath) throw new Error(uploadRes.error ?? "업로드 실패");
      const path = uploadRes.audioPath;
      setAudioPath(path);

      // 2. CLOVA 제출
      setPhase("processing");
      setStatus("음성을 분석하는 중이에요… 잠시 기다려주세요.");
      const submitRes = await fetch("/api/clova-stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: path }),
      });
      const submitData = (await submitRes.json()) as { ok: boolean; token?: string; error?: string };
      if (!submitData.ok || !submitData.token) {
        throw new Error(submitData.error ?? "전사 제출 실패");
      }
      const token = submitData.token;

      // 3. 폴링
      const rawText = await pollUntilDone(token);

      // 4. Claude 정리
      setStatus("AI 가 문장을 다듬는 중이에요…");
      const cleanRes = await fetch("/api/clova-stt/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      let refinedText = rawText;
      if (cleanRes.ok) {
        const cleanData = (await cleanRes.json()) as { ok: boolean; refined?: string };
        if (cleanData.ok && cleanData.refined) refinedText = cleanData.refined;
      }

      setTranscript(rawText);
      setRefined(refinedText);
      setPhase("review");
      setStatus("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPhase("record");
      setStatus("");
    }
  }

  async function pollUntilDone(token: string): Promise<string> {
    for (let i = 0; i < MAX_POLL_TRIES; i++) {
      await wait(POLL_INTERVAL_MS);
      const res = await fetch(`/api/clova-stt/status?token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as { ok: boolean; status?: string; text?: string };
      if (!data.ok) throw new Error("폴링 실패");
      if (data.status === "COMPLETED") return data.text ?? "";
      if (data.status === "FAILED") throw new Error("음성 인식에 실패했어요.");
      // RUNNING or SUBMITTED → 계속 대기
    }
    throw new Error("처리 시간이 너무 오래 걸려요. 짧게 나눠 녹음해 주세요.");
  }

  async function handleSave() {
    if (!selectedTopic || !audioPath) return;
    setError(null);
    setSaving(true);
    const result = await saveFreeRecordingAction({
      audioPath,
      transcript,
      refined,
      topicTitle: selectedTopic.title,
    });
    setSaving(false);
    if (result.ok) {
      setPhase("done");
    } else {
      setError(result.error ?? "저장 실패");
    }
  }

  // ── 렌더 ──
  if (phase === "done") {
    return (
      <div className="flex flex-col gap-6 text-center">
        <div className="text-5xl">✅</div>
        <p className="text-2xl font-bold text-ink">저장됐어요!</p>
        <p className="text-lg text-ink-soft">인생 연혁에서 확인하실 수 있어요.</p>
        <button
          type="button"
          onClick={() => router.push("/life-timeline")}
          className="mx-auto min-h-[56px] rounded-md bg-action px-8 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          인생 연혁으로 →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 물꼬 선택 */}
      {(phase === "topic" || phase === "record") && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-ink">어떤 이야기를 해볼까요?</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => { setSelectedTopic(t); setPhase("record"); }}
                  className={
                    "w-full min-h-[56px] rounded-md border-2 px-5 py-3 text-left text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
                    (selectedTopic?.key === t.key
                      ? "border-action bg-banner text-action"
                      : "border-line bg-surface text-ink hover:bg-banner")
                  }
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 녹음 UI */}
      {phase === "record" && selectedTopic && (
        <section className="flex flex-col gap-4">
          <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-5 py-4">
            <p className="text-lg font-semibold text-amber-900">
              📢 {selectedTopic.title}
            </p>
            <p className="mt-1 text-base text-amber-800">
              편하게 말씀해 주세요. 녹음이 끝난 뒤 다시 들어보실 수 있어요.
            </p>
          </div>
          <FreeRecorder onCapture={handleCapture} />
        </section>
      )}

      {/* 로딩 */}
      {(phase === "uploading" || phase === "processing") && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-action" />
          <p className="text-lg text-ink">{status}</p>
          {phase === "processing" && (
            <p className="text-base text-ink-soft">보통 1~3분 정도 걸려요.</p>
          )}
        </div>
      )}

      {/* 검토 */}
      {phase === "review" && (
        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-bold text-ink">내용을 확인해 주세요</h2>

          <div className="flex flex-col gap-2">
            <label className="text-base font-semibold text-ink-soft">
              원본 전사
            </label>
            <div className="min-h-[80px] rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink-soft whitespace-pre-wrap">
              {transcript || "(전사된 내용이 없어요)"}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="refined-text" className="text-base font-semibold text-ink">
              AI 가 다듬은 글 <span className="font-normal text-ink-soft">(수정하실 수 있어요)</span>
            </label>
            <textarea
              id="refined-text"
              value={refined}
              onChange={(e) => setRefined(e.target.value)}
              rows={6}
              className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex min-h-[56px] flex-1 items-center justify-center rounded-md bg-action px-6 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "이 내용으로 저장"}
            </button>
            <button
              type="button"
              onClick={() => { setPhase("record"); setError(null); }}
              disabled={saving}
              className="min-h-[56px] rounded-md border-2 border-line px-6 text-lg font-semibold text-ink hover:bg-surface focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              다시 녹음
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── 헬퍼 ──
function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Supabase 직접 업로드: /api/recordings 는 DB 소유권 검사로 tmp_id 거부됨.
// 대신 전용 업로드 엔드포인트를 사용.
async function uploadAudioDirect(
  userId: string,
  tmpId: string,
  blob: Blob,
  mimeType: string,
): Promise<{ ok: boolean; audioPath?: string; error?: string }> {
  const fd = new FormData();
  fd.append("file", blob, "recording.webm");
  fd.append("tmpId", tmpId);
  fd.append("mimeType", mimeType);
  const res = await fetch("/api/clova-stt/upload", { method: "POST", body: fd });
  return res.json() as Promise<{ ok: boolean; audioPath?: string; error?: string }>;
}
