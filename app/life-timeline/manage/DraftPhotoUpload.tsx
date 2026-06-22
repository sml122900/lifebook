"use client";

// 사건 draft 카드 — 인라인 사진 첨부 (compact).
//
// POST /api/photos with memoryId (기존 패턴 그대로).
// isDraft=true 메모리도 첨부 가능 — API 가 isDraft 를 체크하지 않음.
// 승인 후 /life-timeline/[id]/edit 에서 전체 관리(캡션·빼기·삭제).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { stripGps } from "@/lib/photo-exif";

const MAX_BYTES = 10 * 1024 * 1024;

export function DraftPhotoUpload({ memoryId }: { memoryId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(`사진은 10MB 까지 올릴 수 있어요. (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      e.target.value = "";
      return;
    }
    if (file.type === "image/heic" || file.type === "image/heif") {
      setError("HEIC 형식은 아직 받지 못해요. 설정 > 카메라 > 포맷 > 호환성으로 바꾼 뒤 다시 시도해 주세요.");
      e.target.value = "";
      return;
    }

    startTransition(async () => {
      try {
        const { file: clean, hadGps, stripped } = await stripGps(file);
        if (hadGps && !stripped) {
          setError("위치정보를 지우지 못해 올리지 못했어요. 다른 사진을 시도해 주세요.");
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
        const fd = new FormData();
        fd.append("file", clean);
        fd.append("memoryId", memoryId);
        fd.append("periodAnchor", "both");

        const res = await fetch("/api/photos", { method: "POST", body: fd });
        const data: { ok: boolean; error?: string } = await res.json();
        if (!data.ok) {
          setError(data.error || "첨부에 실패했어요.");
        } else {
          setUploadedCount((n) => n + 1);
          router.refresh();
        }
      } catch (e) {
        console.error("[draft-photo-upload]", e);
        setError("첨부에 실패했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start text-sm font-semibold text-sky-700 underline-offset-2 hover:underline focus:outline-none"
        >
          📷 사진 붙이기
          {uploadedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
              {uploadedCount}장 올림
            </span>
          )}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-semibold text-sky-800">
            📷 사진 붙이기
            {uploadedCount > 0 && (
              <span className="ml-1.5 font-normal text-sky-600">{uploadedCount}장 올렸어요</span>
            )}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-soft">jpeg / png / webp, 최대 10MB</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              disabled={isPending}
              className="text-sm file:mr-2 file:rounded file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          {isPending && <p className="text-xs text-ink-soft">올리는 중…</p>}
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="self-start text-xs text-ink-faint hover:text-ink-soft"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
