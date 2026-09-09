"use client";

import { useEffect, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { switchToV3Action } from "./onboarding-track-actions";

// v3 P17-3 — v2 사용자에게 "새 방식으로 이야기해보기"를 제안하는 배너 +
// confirm 모달. DeletePersonButton 과 같은 모달 패턴(Escape 닫힘, body
// scroll lock) 이지만 파괴적 동작이 아니라 primary 버튼을 쓴다. 강요 느낌
// 없이 — 배너는 항상 닫을 수 있고(세션 내내 다시 보여도 무방, 압박 아님),
// 실제 전환은 모달에서 한 번 더 확인해야만 일어난다.
export function SwitchToV3Banner() {
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
      try {
        await switchToV3Action();
      } catch (err) {
        // redirect()는 throw로 동작 — Next 내부 redirect 신호는 그대로
        // 흐르도록 두고, 실제 에러만 화면에 표시.
        const message = err instanceof Error ? err.message : "";
        if (message === "NEXT_REDIRECT") throw err;
        setError("전환하지 못했어요. 잠시 후 다시 시도해 주세요.");
        console.error("[switch-to-v3]", err);
      }
    });
  }

  return (
    <div
      role="status"
      className="flex flex-col items-start justify-between gap-3 rounded-md border-2 border-brand bg-banner px-5 py-4 sm:flex-row sm:items-center"
    >
      <p className="text-base text-action sm:text-lg">
        <b>새로워진 대화형으로 이야기해보시겠어요?</b> 편하게 대답만 하시면
        저희가 정리해드려요.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[48px] flex-shrink-0 items-center justify-center rounded-md border-2 border-brand bg-surface px-4 py-2 text-base font-semibold text-action hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        새 방식으로 이야기해보기
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-v3-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border-2 border-brand bg-surface p-6 shadow-xl"
          >
            <h2 id="switch-v3-title" className="text-2xl font-bold text-ink">
              새 방식으로 이야기해볼까요?
            </h2>
            <p className="mt-3 text-lg text-ink-soft">
              지금까지 기록은 그대로 남아요. 새 방식으로 이야기를 이어가볼까요?
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
                className={buttonClasses("primary", "md")}
              >
                {isPending ? "전환 중…" : "예, 새 방식으로"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
