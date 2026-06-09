"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { PhotoPeriodAnchor } from "@/lib/life-events";

// Phase Photo (4단계) — 인생 이벤트 편집 화면의 "📷 사진" 섹션.
//
// EventForm(이벤트 본문 편집)과 별개의 형제 컴포넌트 — 폼은 무수정.
// 이 이벤트(memoryId)에 사진을 첨부(attachPhotoToMemory via POST /api/photos
// memoryId 분기)하고, 이미 붙은 사진을 보고 삭제(DELETE /api/photos/[id]).
//
// 4단계+ 기간 이벤트(학교/군대/직장)는 타임라인에서 시작·끝 두 점으로 split
// 되므로, 사진마다 periodAnchor(시작/끝/전체)를 골라 어느 점에 띄울지 정한다.
//   - 새 첨부: isPeriod 면 3지선다(카테고리별 라벨), 아니면 both 고정
//   - 기존 사진: isPeriod 면 인라인 토글로 재태그(PATCH /api/photos/[id])
//
// 첨부는 year/month 가 이벤트에서 상속되므로 캡션만 입력. 거부 케이스
// (HEIC/10MB/위장/magic number)는 서버(/api/photos)가 동일하게 적용.
// 편집 화면이라 삭제 OK (타임라인 라이트박스는 보기 전용이었지만 여기선 관리).

export type AttachedPhoto = {
  id: string;
  signedUrl: string;
  caption: string | null;
  bytes: number;
  mimeType: string;
  periodAnchor: PhotoPeriodAnchor;
};

const MAX_BYTES_CLIENT = 10 * 1024 * 1024;
const CAPTION_MAX = 200;

// 시작/전체/끝 3지선다 라벨 — 모든 기간 카테고리 공통(시작 무렵 / 끝 무렵).
// 입학/졸업 같은 카테고리별 단어는 학교에만 맞아 어색해서 공통어로 통일.
const ANCHOR_OPTIONS: { value: PhotoPeriodAnchor; label: string }[] = [
  { value: "start", label: "시작 무렵" },
  { value: "both", label: "기간 전체" },
  { value: "end", label: "끝 무렵" },
];

export function EventPhotos({
  memoryId,
  isPeriod,
  photos,
}: {
  memoryId: string;
  isPeriod: boolean;
  photos: AttachedPhoto[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [attachAnchor, setAttachAnchor] = useState<PhotoPeriodAnchor>("both");
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // 기존 사진 재태그 옵티미스틱 오버라이드(id → anchor). 없으면 prop 값 사용.
  const [anchorOverride, setAnchorOverride] = useState<
    Record<string, PhotoPeriodAnchor>
  >({});
  const [isPending, startTransition] = useTransition();

  const visible = photos.filter((p) => !hiddenIds.has(p.id));

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) {
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (f.size > MAX_BYTES_CLIENT) {
      setError(
        `사진은 10MB 까지 올릴 수 있어요. (지금 ${(f.size / 1024 / 1024).toFixed(1)}MB)`,
      );
      e.target.value = "";
      return;
    }
    if (f.type === "image/heic" || f.type === "image/heif") {
      setError(
        "아이폰 HEIC 형식은 아직 받지 못해요. 설정 > 카메라 > 포맷 > '호환성' 으로 바꾼 뒤 다시 찍어주세요.",
      );
      e.target.value = "";
      return;
    }
    setSelectedFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function resetForm() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setAttachAnchor("both");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onAttach() {
    if (!selectedFile) return;
    setError(null);
    if (caption.length > CAPTION_MAX) {
      setError(`한 줄 설명은 ${CAPTION_MAX}자까지 적을 수 있어요.`);
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("memoryId", memoryId);
        if (caption.trim() !== "") fd.append("caption", caption.trim());
        // 단일 시점이면 attachAnchor 는 항상 both(선택지 안 보임).
        fd.append("periodAnchor", isPeriod ? attachAnchor : "both");

        const res = await fetch("/api/photos", { method: "POST", body: fd });
        const data: { ok: boolean; error?: string } = await res.json();
        if (!data.ok) {
          setError(data.error || "첨부에 실패했어요.");
          return;
        }
        resetForm();
        router.refresh();
      } catch (e) {
        console.error("[event-photo-attach-client]", e);
        setError("첨부에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function onRetag(photoId: string, anchor: PhotoPeriodAnchor, prev: PhotoPeriodAnchor) {
    if (anchor === prev) return;
    setError(null);
    setAnchorOverride((m) => ({ ...m, [photoId]: anchor }));
    startTransition(async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodAnchor: anchor }),
        });
        const data: { ok: boolean; error?: string } = await res.json();
        if (!data.ok) {
          setAnchorOverride((m) => ({ ...m, [photoId]: prev }));
          setError(data.error || "변경에 실패했어요.");
          return;
        }
        router.refresh();
      } catch (e) {
        console.error("[event-photo-retag-client]", e);
        setAnchorOverride((m) => ({ ...m, [photoId]: prev }));
        setError("변경에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function onDelete(photoId: string) {
    setError(null);
    if (!confirm("이 사진을 지울까요?\n다시 되돌릴 수 없어요.")) {
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
        const data: { ok: boolean; error?: string } = await res.json();
        if (!data.ok) {
          setHiddenIds((prev) => {
            const next = new Set(prev);
            next.delete(photoId);
            return next;
          });
          setError(data.error || "삭제에 실패했어요.");
          return;
        }
        router.refresh();
      } catch (e) {
        console.error("[event-photo-delete-client]", e);
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(photoId);
          return next;
        });
        setError("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">
          <span aria-hidden className="mr-1">📷</span>사진
        </h2>
        <p className="mt-1 text-base text-zinc-600">
          이 이야기와 함께 남기고 싶은 사진을 붙여보세요.
        </p>
        {isPeriod && (
          <p className="mt-2 rounded-md border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            긴 기간의 이야기예요 — 사진마다 <b>시작 무렵</b> / <b>끝 무렵</b> /
            기간 전체 중에서 고를 수 있어요.
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      {/* 이미 붙은 사진 */}
      {visible.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((p) => {
            const current = anchorOverride[p.id] ?? p.periodAnchor;
            return (
              <li
                key={p.id}
                className="flex flex-col overflow-hidden rounded-md border-2 border-zinc-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.signedUrl}
                  alt={p.caption || "첨부한 사진"}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {p.caption && (
                  <p className="truncate px-2 py-1 text-xs text-zinc-600">
                    {p.caption}
                  </p>
                )}
                {isPeriod && (
                  <div className="px-2 pt-1">
                    <AnchorPicker
                      value={current}
                      options={ANCHOR_OPTIONS}
                      onChange={(v) => onRetag(p.id, v, current)}
                      disabled={isPending}
                      size="sm"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  disabled={isPending}
                  className="m-2 inline-flex min-h-[40px] items-center justify-center rounded-md border-2 border-rose-300 bg-white px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  사진 지우기
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 새 사진 첨부 */}
      <div className="flex flex-col gap-3 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-4">
        <label className="flex flex-col gap-2">
          <span className="text-base text-zinc-700">
            사진 한 장 고르기 (jpeg / png / webp, 최대 10MB)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            disabled={isPending}
            className="text-base file:mr-3 file:rounded-md file:border-2 file:border-zinc-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-800 hover:file:bg-zinc-100"
          />
        </label>

        {previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="미리보기"
              className="max-h-[220px] self-start rounded-md border-2 border-zinc-300"
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-zinc-700">
                한 줄 설명{" "}
                <span className="font-normal text-zinc-500">(선택)</span>
              </span>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="예: 입학식 날 교문 앞에서"
                maxLength={CAPTION_MAX}
                disabled={isPending}
                className="w-full rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
              />
            </label>

            {isPeriod && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-zinc-700">
                  이 사진은 언제쯤인가요?
                </span>
                <AnchorPicker
                  value={attachAnchor}
                  options={ANCHOR_OPTIONS}
                  onChange={setAttachAnchor}
                  disabled={isPending}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onAttach}
                disabled={isPending}
                className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-amber-600 px-5 py-2 text-base font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                {isPending ? "붙이는 중…" : "이 이야기에 사진 붙이기"}
              </button>
              {!isPending && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-base font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
                >
                  취소
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// 시작/전체/끝 3지선다. 새 첨부 + 기존 재태그 공용.
function AnchorPicker({
  value,
  options,
  onChange,
  disabled,
  size = "md",
}: {
  value: PhotoPeriodAnchor;
  options: { value: PhotoPeriodAnchor; label: string }[];
  onChange: (v: PhotoPeriodAnchor) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            disabled={disabled}
            aria-pressed={active}
            className={
              (size === "sm"
                ? "min-h-[34px] px-2.5 text-xs "
                : "min-h-[44px] px-4 text-base ") +
              "inline-flex items-center justify-center rounded-md border-2 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 " +
              (active
                ? "border-amber-500 bg-amber-100 text-amber-900"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
