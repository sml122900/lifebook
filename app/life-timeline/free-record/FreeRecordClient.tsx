"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FreeRecorder } from "@/app/components/FreeRecorder";
import type { SplitSegment } from "@/lib/free-recording-split";
import { calcSttTokens } from "@/lib/stt-cost";
import {
  checkSttBalanceAction,
  saveFreeRecordingSegments,
  splitTranscriptAction,
} from "./actions";

// Phase 1 물꼬 목록 — 고정 주제. 자유 주제는 freeformTopic prop 으로.
const TOPICS = [
  { key: "first_job", title: "처음 직장을 구하던 때" },
  { key: "school_memory", title: "학창시절 가장 기억에 남는 순간" },
  { key: "family_milestone", title: "가족과 함께한 특별한 날" },
  { key: "hometown", title: "고향과 어린 시절" },
  { key: "turning_point", title: "인생의 전환점이 된 일" },
  { key: "free", title: "그냥 하고 싶은 이야기" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  BIRTH: "출생", KINDERGARTEN: "유치원", ELEMENTARY: "초등",
  MIDDLE: "중학", HIGH: "고등", UNIVERSITY: "대학",
  MILITARY: "군대", WORK: "직장", RELATIONSHIP: "결혼", FAMILY: "자녀",
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS);

// React key + 편집 필드를 함께 가지는 로컬 세그먼트 타입
type SegmentDraft = SplitSegment & { id: number };

type Phase =
  | "topic"          // 물꼬 선택
  | "record"         // 녹음
  | "confirming"     // 전사 전 비용 확인
  | "uploading"      // Supabase 업로드 중
  | "processing"     // CLOVA STT 폴링 중
  | "splitting"      // Claude 분할 중
  | "segmentReview"  // 분할 결과 검토·수정
  | "done";          // 완료

type BalanceInfo = {
  chargingEnabled: boolean;
  needed: number;
  balance: number;
  sufficient: boolean;
};

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_TRIES = 60; // 4초 × 60 = 4분

export function FreeRecordClient({
  userId,
  birthYear = null,
  freeformTopic = null,
}: {
  userId: string;
  birthYear?: number | null;
  freeformTopic?: string | null;
}) {
  const router = useRouter();

  // 자유 주제가 있으면 처음부터 record 단계로
  const [phase, setPhase] = useState<Phase>(freeformTopic ? "record" : "topic");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // 자유 주제 또는 고정 주제
  const freeformEntry = freeformTopic
    ? { key: "freeform" as const, title: freeformTopic }
    : null;
  const [selectedTopic, setSelectedTopic] = useState<
    (typeof TOPICS)[number] | { key: string; title: string } | null
  >(freeformEntry);

  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState(""); // STT 원본 (부모 메모리 저장용)
  const [audioPath, setAudioPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  // confirming 단계용
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingMime, setPendingMime] = useState("audio/webm");
  const [durationSec, setDurationSec] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);

  // segmentReview 단계용
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const [nextTopics, setNextTopics] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // ── FreeRecorder 가 녹음 완료하면 → confirming 단계 ──
  async function handleCapture(blob: Blob, mimeType: string, elapsedSec: number) {
    if (!selectedTopic) return;
    setError(null);
    setPendingBlob(blob);
    setPendingMime(mimeType);
    setDurationSec(elapsedSec);
    setBalanceInfo(null);
    setBalanceLoading(true);
    setPhase("confirming");

    const info = await checkSttBalanceAction(elapsedSec);
    setBalanceLoading(false);
    setBalanceInfo(info);
  }

  // ── [전사 시작] 클릭 ──
  async function handleConfirmTranscribe() {
    if (!selectedTopic || !pendingBlob) return;
    const blob = pendingBlob;
    const mime = pendingMime;

    setError(null);
    setPhase("uploading");
    setStatus("녹음 파일을 저장하는 중이에요…");

    try {
      // 1. 오디오 업로드
      const tmpId = `tmp_${Date.now()}`;
      const uploadRes = await uploadAudioDirect(userId, tmpId, blob, mime);
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

      // 3. 폴링
      const rawText = await pollUntilDone(submitData.token);
      setTranscript(rawText);

      // 4. 토큰 차감 (비치명적)
      await fetch("/api/clova-stt/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: path, durationSec }),
      }).catch((e) => {
        console.warn("[stt-charge] non-fatal:", e instanceof Error ? e.message : e);
      });

      // 5. Claude 분할
      setPhase("splitting");
      setStatus("AI 가 이야기를 정리하는 중이에요…");

      const splitResult = await splitTranscriptAction({
        transcript: rawText,
        topicTitle: selectedTopic.title,
        birthYear,
      });

      if (splitResult.ok && splitResult.segments && splitResult.segments.length > 0) {
        setSegments(splitResult.segments.map((s, i) => ({ ...s, id: i })));
        setNextTopics(splitResult.nextTopics ?? []);
      } else {
        // 분할 실패 시 fallback: 전체를 1개 세그먼트로
        setSegments([{
          id: 0,
          title: selectedTopic.title,
          content: rawText,
          estimatedYear: null,
          estimatedMonth: null,
          category: null,
          precision: "APPROXIMATE",
        }]);
        setNextTopics([]);
      }

      setPhase("segmentReview");
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
    }
    throw new Error("처리 시간이 너무 오래 걸려요. 짧게 나눠 녹음해 주세요.");
  }

  // ── 세그먼트 조작 ──
  function updateSegment(idx: number, patch: Partial<SegmentDraft>) {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function deleteSegment(idx: number) {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }

  function mergeWithPrev(idx: number) {
    if (idx <= 0) return;
    setSegments((prev) => {
      const next = [...prev];
      const merged = {
        ...next[idx - 1],
        content: [next[idx - 1].content, next[idx].content].filter(Boolean).join("\n\n"),
      };
      next.splice(idx - 1, 2, merged);
      return next;
    });
    setEditingIdx(null);
  }

  // ── [모두 저장] ──
  async function handleSaveSegments() {
    if (!selectedTopic || !audioPath) return;
    setError(null);
    setSaving(true);
    const result = await saveFreeRecordingSegments({
      audioPath,
      transcript,
      topicTitle: selectedTopic.title,
      segments: segments.map(({ id: _id, ...rest }) => rest),
    });
    setSaving(false);
    if (result.ok) {
      setSavedCount(result.count ?? 0);
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
        <p className="text-lg text-ink-soft">
          {savedCount > 0
            ? `${savedCount}개의 이야기가 인생 연혁에 추가됐어요.`
            : "인생 연혁에서 확인하실 수 있어요."}
        </p>
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
      {/* 물꼬 선택 — topic/record/confirming 단계에서 표시 */}
      {(phase === "topic" || phase === "record" || phase === "confirming") && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-ink">어떤 이야기를 해볼까요?</h2>

          {/* 자유 주제가 있으면 그것만 표시 */}
          {freeformTopic ? (
            <div className="rounded-md border-2 border-action bg-banner px-5 py-3">
              <p className="text-lg font-semibold text-action">{freeformTopic}</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {TOPICS.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTopic(t);
                      setPhase("record");
                    }}
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
          )}
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

      {/* 전사 전 확인 다이얼로그 */}
      {phase === "confirming" && (
        <section className="flex flex-col gap-6 rounded-md border-2 border-line bg-surface px-6 py-6">
          <h2 className="text-xl font-bold text-ink">전사를 시작할까요?</h2>

          <div className="flex flex-col gap-2">
            <p className="text-lg text-ink">
              녹음 시간:{" "}
              <span className="font-semibold">
                {Math.floor(durationSec / 60)}분 {durationSec % 60}초
              </span>
            </p>

            {balanceLoading && (
              <p className="text-base text-ink-soft">확인 중이에요…</p>
            )}

            {!balanceLoading && balanceInfo && (
              <>
                {!balanceInfo.chargingEnabled && (
                  <p className="text-base text-emerald-700">
                    지금은 무료로 전사해 드려요.
                  </p>
                )}
                {balanceInfo.chargingEnabled && balanceInfo.sufficient && (
                  <p className="text-base text-ink">
                    약{" "}
                    <span className="font-semibold">
                      {calcSttTokens(durationSec)}토큰
                    </span>
                    이 차감돼요.{" "}
                    <span className="text-ink-soft">
                      (현재 잔액: {balanceInfo.balance}토큰)
                    </span>
                  </p>
                )}
                {balanceInfo.chargingEnabled && !balanceInfo.sufficient && (
                  <div className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-700">
                    <p>
                      토큰이 부족해요.{" "}
                      <span className="font-semibold">
                        필요 {balanceInfo.needed}토큰 / 현재 {balanceInfo.balance}토큰
                      </span>
                    </p>
                    <Link
                      href="/billing"
                      className="mt-2 inline-block text-base font-semibold text-rose-700 underline"
                    >
                      충전하기 →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirmTranscribe}
              disabled={
                balanceLoading ||
                (balanceInfo !== null && balanceInfo.chargingEnabled && !balanceInfo.sufficient)
              }
              className="flex min-h-[56px] flex-1 items-center justify-center rounded-md bg-action px-6 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전사 시작
            </button>
            <button
              type="button"
              onClick={() => { setPendingBlob(null); setBalanceInfo(null); setPhase("record"); }}
              className="min-h-[56px] rounded-md border-2 border-line px-6 text-lg font-semibold text-ink hover:bg-surface focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              취소
            </button>
          </div>
        </section>
      )}

      {/* 로딩 (업로드 / STT 폴링 / Claude 분할) */}
      {(phase === "uploading" || phase === "processing" || phase === "splitting") && (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-action" />
          <p className="text-lg text-ink">{status}</p>
          {phase === "processing" && (
            <p className="text-base text-ink-soft">보통 1~3분 정도 걸려요.</p>
          )}
          {phase === "splitting" && (
            <p className="text-base text-ink-soft">이야기를 시간순으로 정리하고 있어요.</p>
          )}
        </div>
      )}

      {/* 분할 결과 검토 */}
      {phase === "segmentReview" && (
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-ink">
              이야기를 {segments.length}개 장면으로 나눴어요
            </h2>
            <p className="mt-1 text-base text-ink-soft">
              제목·연도·내용을 확인하고 수정해 주세요.
            </p>
          </div>

          <ol className="flex flex-col gap-2">
            {segments.map((seg, idx) => (
              <li key={seg.id} className="flex flex-col gap-2">
                {/* 앞 카드와 합치기 버튼 */}
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => mergeWithPrev(idx)}
                    className="self-start text-sm text-ink-soft underline hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    ↑ 위 이야기와 합치기
                  </button>
                )}

                <div className="rounded-md border-2 border-line bg-surface px-5 py-4">
                  {editingIdx === idx ? (
                    /* 편집 모드 */
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-ink-soft">제목</label>
                        <input
                          type="text"
                          value={seg.title}
                          maxLength={50}
                          onChange={(e) => updateSegment(idx, { title: e.target.value })}
                          className="w-full rounded-md border-2 border-line px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-semibold text-ink-soft">연도</label>
                          <input
                            type="number"
                            value={seg.estimatedYear ?? ""}
                            min={1900}
                            max={2099}
                            placeholder="모름"
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              updateSegment(idx, { estimatedYear: isNaN(v) ? null : v });
                            }}
                            className="w-28 rounded-md border-2 border-line px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-semibold text-ink-soft">월</label>
                          <input
                            type="number"
                            value={seg.estimatedMonth ?? ""}
                            min={1}
                            max={12}
                            placeholder="모름"
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              updateSegment(idx, { estimatedMonth: isNaN(v) ? null : v });
                            }}
                            className="w-20 rounded-md border-2 border-line px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-semibold text-ink-soft">카테고리</label>
                          <select
                            value={seg.category ?? ""}
                            onChange={(e) => updateSegment(idx, { category: e.target.value || null })}
                            className="rounded-md border-2 border-line px-3 py-2 text-base text-ink focus:border-amber-500 focus:outline-none"
                          >
                            <option value="">선택 안 함</option>
                            {CATEGORY_OPTIONS.map(([v, label]) => (
                              <option key={v} value={v}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-ink-soft">내용</label>
                        <textarea
                          value={seg.content}
                          rows={5}
                          onChange={(e) => updateSegment(idx, { content: e.target.value })}
                          className="w-full rounded-md border-2 border-line px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setEditingIdx(null)}
                          className="min-h-[48px] rounded-md bg-action px-5 text-base font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                          완료
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSegment(idx)}
                          className="min-h-[48px] rounded-md border-2 border-rose-300 px-5 text-base font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                        >
                          이 장면 삭제
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 보기 모드 */
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {seg.category && (
                          <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-800">
                            {CATEGORY_LABELS[seg.category] ?? seg.category}
                          </span>
                        )}
                        {seg.estimatedYear && (
                          <span className="text-sm text-ink-soft">
                            {seg.estimatedYear}년
                            {seg.estimatedMonth ? ` ${seg.estimatedMonth}월` : ""}
                            {seg.precision === "APPROXIMATE" ? " 즈음" : ""}
                          </span>
                        )}
                        {!seg.estimatedYear && (
                          <span className="text-sm text-ink-soft">연도 미확인</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingIdx(idx)}
                          className="ml-auto text-sm text-ink-soft underline hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          수정
                        </button>
                      </div>
                      <p className="text-lg font-bold text-ink">{seg.title}</p>
                      <p className="line-clamp-3 whitespace-pre-wrap text-base text-ink-soft">
                        {seg.content || "(내용 없음)"}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* 다음 주제 칩 */}
          {nextTopics.length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface px-5 py-4">
              <p className="text-base font-semibold text-ink-soft">
                다음에 이런 이야기도 해볼까요?
              </p>
              <div className="flex flex-wrap gap-2">
                {nextTopics.map((topic, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => router.push(
                      `/life-timeline/free-record?topic=${encodeURIComponent(topic)}`
                    )}
                    className="rounded-full border-2 border-line bg-canvas px-4 py-2 text-base text-ink hover:bg-banner focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 저장 / 다시 녹음 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSaveSegments}
              disabled={saving || segments.length === 0}
              className="flex min-h-[56px] flex-1 items-center justify-center rounded-md bg-action px-6 text-lg font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {saving ? "저장 중…" : `${segments.length}개 이야기 저장하기`}
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

