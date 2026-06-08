"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { UserPhoto } from "@/lib/photos";

// Phase Photo (2단계) — 사진 그리드 + 클릭 시 크게 보기 모달 + 삭제.
// 모달: dialog 패턴 (focus trap + Esc 닫기 + 배경 클릭 닫기).
// 삭제: 옵티미스틱 (확인 후 즉시 숨김), 실패 시 rollback + 에러.

export function PhotosGrid({ photos }: { photos: UserPhoto[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = photos.filter((p) => !hiddenIds.has(p.id));
  const openPhoto = openId
    ? photos.find((p) => p.id === openId) ?? null
    : null;

  function whenLabel(p: UserPhoto): string {
    return p.month ? `${p.year}년 ${p.month}월` : `${p.year}년`;
  }

  function onDelete(photoId: string) {
    setDeleteError(null);
    // 시니어 친화 — 한 번 더 확인 (실수 회피)
    if (
      !confirm(
        "이 사진을 지울까요?\n다시 되돌릴 수 없어요.",
      )
    ) {
      return;
    }
    // 옵티미스틱 — 즉시 숨김
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
    setOpenId(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}`, {
          method: "DELETE",
        });
        const data: { ok: boolean; error?: string } = await res.json();
        if (!data.ok) {
          // rollback
          setHiddenIds((prev) => {
            const next = new Set(prev);
            next.delete(photoId);
            return next;
          });
          setDeleteError(data.error || "삭제에 실패했어요.");
          return;
        }
        router.refresh();
      } catch (e) {
        console.error("[photo-delete-client]", e);
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(photoId);
          return next;
        });
        setDeleteError("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <>
      {deleteError && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {deleteError}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((p) => (
          <li
            key={p.id}
            className="overflow-hidden rounded-md border-2 border-zinc-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setOpenId(p.id)}
              className="block w-full text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
              aria-label={`${whenLabel(p)} 사진 크게 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.signedUrl}
                alt={p.caption || `${whenLabel(p)} 사진`}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="px-2 py-2">
                <p className="text-xs font-semibold text-zinc-700">
                  {whenLabel(p)}
                </p>
                {p.caption && (
                  <p className="mt-0.5 truncate text-xs text-zinc-600">
                    {p.caption}
                  </p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {openPhoto && (
        <PhotoModal
          photo={openPhoto}
          onClose={() => setOpenId(null)}
          onDelete={() => onDelete(openPhoto.id)}
          isPending={isPending}
        />
      )}
    </>
  );
}

function PhotoModal({
  photo,
  onClose,
  onDelete,
  isPending,
}: {
  photo: UserPhoto;
  onClose: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const whenLabel = photo.month
    ? `${photo.year}년 ${photo.month}월`
    : `${photo.year}년`;

  // 배경 클릭 닫기 (이벤트가 자식까지 안 전파되게 자식이 stopPropagation)
  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }
  // Esc 닫기 (input/textarea IME 가드는 모달에 입력 없어 불필요)
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${whenLabel} 사진`}
      onClick={onBackdropClick}
      onKeyDown={onKey}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="flex max-h-full max-w-3xl flex-col gap-3 rounded-md bg-white p-4 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.signedUrl}
          alt={photo.caption || `${whenLabel} 사진`}
          className="max-h-[70vh] w-auto self-center rounded-md"
        />
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-zinc-900">{whenLabel}</p>
          {photo.caption && (
            <p className="text-sm text-zinc-700">{photo.caption}</p>
          )}
          <p className="text-xs text-zinc-500">
            {(photo.bytes / 1024).toFixed(0)} KB · {photo.mimeType}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 border-t-2 border-zinc-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
            autoFocus
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-rose-400 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "지우는 중…" : "사진 지우기"}
          </button>
        </div>
      </div>
    </div>
  );
}
