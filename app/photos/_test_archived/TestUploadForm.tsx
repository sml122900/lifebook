"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Phase Photo 1단계 — 업로드 폼 (클라).
// 단순 input + 미리보기 + [올리기] / [취소]. 시니어 친화 큰 버튼.
// 클라 가드는 1차 — 정확한 검증(magic number 등)은 서버.

type UploadResult =
  | {
      ok: true;
      path: string;
      signedUrl: string;
      bytes: number;
      mimeType: string;
    }
  | { ok: false; error: string };

const MAX_BYTES_CLIENT = 10 * 1024 * 1024;

export function TestUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) {
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    // 클라 1차 가드 — 정확한 거부는 서버 (magic number 검증)
    if (f.size > MAX_BYTES_CLIENT) {
      setError(
        `사진은 10MB 까지 올릴 수 있어요. (지금 ${(f.size / 1024 / 1024).toFixed(1)}MB)`,
      );
      e.target.value = "";
      return;
    }
    setSelectedFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function onReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onUpload() {
    if (!selectedFile) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", selectedFile);
        const res = await fetch("/api/photos/test-upload", {
          method: "POST",
          body: fd,
        });
        const data: UploadResult = await res.json();
        if (!data.ok) {
          setError(data.error);
          return;
        }
        // 성공 — 폼 초기화 + RSC refresh (목록 갱신)
        onReset();
        router.refresh();
      } catch (e) {
        console.error("[photo-upload-client]", e);
        setError("업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-zinc-200 bg-canvas p-5">
      <h2 className="text-xl font-bold text-ink">사진 올리기</h2>

      <label className="flex flex-col gap-2">
        <span className="text-base text-ink-soft">
          폰에서 사진을 골라주세요 (jpeg / png / webp).
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          disabled={isPending}
          className="text-base file:mr-3 file:rounded-md file:border-2 file:border-zinc-300 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-zinc-100"
        />
      </label>

      {previewUrl && (
        <div className="flex flex-col items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="미리보기"
            className="max-h-[300px] rounded-md border-2 border-zinc-300"
          />
          <p className="text-sm text-ink-soft">
            {selectedFile?.name} ·{" "}
            {((selectedFile?.size ?? 0) / 1024).toFixed(0)} KB
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onUpload}
          disabled={!selectedFile || isPending}
          className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isPending ? "올리는 중…" : "올리기"}
        </button>
        {selectedFile && !isPending && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-zinc-300 bg-surface px-4 py-2 text-base font-semibold text-ink-soft hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            취소
          </button>
        )}
      </div>
    </section>
  );
}
