"use client";

import { useEffect, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

import { deleteLifeEventAction } from "../actions";

// Phase L4 — 삭제 버튼 + confirm 모달. 시니어 실수 보호 — "정말 삭제할까요?"
// 한 단계 더 거치게.

export function DeleteButton({
  eventId,
  eventLabel,
  redirectTo,
}: {
  eventId: string;
  eventLabel: string;
  // 삭제 성공 후 이동할 경로. 없으면 그 자리 새로고침(목록 화면용).
  // 편집 화면처럼 삭제된 이벤트 페이지에 머물 수 없는 곳은 경로를 넘긴다.
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [open, isPending]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLifeEventAction(eventId);
      if (!result.ok) {
        setError(result.error ?? "삭제하지 못했어요.");
        return;
      }
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${eventLabel} 삭제`}
        className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-rose-300 bg-surface px-4 py-2 text-base font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        삭제
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border-2 border-rose-300 bg-surface p-6 shadow-xl"
          >
            <h2 id="delete-title" className="text-2xl font-bold text-ink">
              정말 삭제할까요?
            </h2>
            <p className="mt-3 text-lg text-ink">
              <b>{eventLabel}</b>
            </p>
            <p className="mt-2 text-base text-ink-soft">
              이 이벤트를 삭제하면 되돌릴 수 없어요.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-base text-rose-900"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                autoFocus
                className={buttonClasses("tertiary", "md")}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-rose-700 px-5 py-3 text-lg font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
              >
                {isPending ? "삭제 중…" : "네, 삭제할게요"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
