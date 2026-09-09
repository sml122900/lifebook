"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/Button";
import { deleteCustomLifeEventAction } from "@/app/actions/life-event";

// v3 P19-2 — 타임라인의 CUSTOM(자유 승격) 이벤트만 지울 수 있다(골격 이벤트는
// 삭제 버튼 자체를 안 그림 — 호출부에서 type==="CUSTOM" 일 때만 렌더).
// app/life-timeline/manage/DeleteButton.tsx 와 같은 모달 패턴, 목록 화면에
// 머무르므로 router.refresh() 로 갱신.
export function DeleteCustomEventButton({
  eventId,
  eventLabel,
}: {
  eventId: string;
  eventLabel: string;
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
      const result = await deleteCustomLifeEventAction(eventId);
      if (!result.ok) {
        setError(result.error ?? "지우지 못했어요.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${eventLabel} 지우기`}
        className={buttonClasses("destructive", "md", "shrink-0")}
      >
        지우기
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-custom-event-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border-2 border-line bg-surface p-6 shadow-xl"
          >
            <h2 id="delete-custom-event-title" className="text-2xl font-bold text-ink">
              이 이야기를 지울까요?
            </h2>
            <p className="mt-3 text-lg text-ink">
              <b>{eventLabel}</b>
            </p>
            <p className="mt-2 text-base text-ink-soft">지우면 되돌릴 수 없어요.</p>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border-2 border-line bg-canvas px-3 py-2 text-base text-danger"
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
                className={buttonClasses("destructive", "md")}
              >
                {isPending ? "지우는 중…" : "지우기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
