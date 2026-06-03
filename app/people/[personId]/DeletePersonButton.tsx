"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deletePersonAction } from "../actions";

// Phase P2 — 인물 삭제 + confirm 모달. life-timeline DeleteButton 과 동일
// 패턴(시니어 실수 방지: 큰 모달, focus [취소], Escape 닫힘, body scroll
// lock). 삭제 성공 시 /people 로 이동.

export function DeletePersonButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
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
      const result = await deletePersonAction(personId);
      if (!result.ok) {
        setError(result.error ?? "삭제하지 못했어요.");
        return;
      }
      setOpen(false);
      router.push("/people");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${personName} 삭제`}
        className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-rose-300 bg-white px-4 py-2 text-base font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        삭제
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-person-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border-2 border-rose-300 bg-white p-6 shadow-xl"
          >
            <h2
              id="delete-person-title"
              className="text-2xl font-bold text-zinc-900"
            >
              정말 삭제할까요?
            </h2>
            <p className="mt-3 text-lg text-zinc-800">
              <b>{personName}</b>
            </p>
            <p className="mt-2 text-base text-zinc-700">
              이 분과 함께한 사건 연결도 모두 사라져요. (사건 자체는 그대로
              남아요.) 되돌릴 수 없어요.
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
                className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-zinc-300 px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-rose-700 px-5 py-3 text-lg font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
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
