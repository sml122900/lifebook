"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { calcAge } from "@/lib/age";
import type { LifeEvent } from "@/lib/life-events";

import { linkPersonAction, unlinkPersonAction } from "../../actions";

// Phase P2 — 한 이벤트 행 + 토글 버튼. LinkResult 4종 안내 처리.
//
// 옵티미스틱: 클릭 즉시 linked 상태 토글. 서버 실패면 되돌리고 에러 노출.
// 동시 클릭은 useTransition 으로 직렬화.

type ToastKind = "ok" | "info" | "error";

export function LinkToggleRow({
  event,
  personId,
  initialLinked,
  birthYear,
}: {
  event: LifeEvent;
  personId: string;
  initialLinked: boolean;
  birthYear: number | null;
}) {
  const router = useRouter();
  const [linked, setLinked] = useState(initialLinked);
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const age = birthYear !== null ? calcAge(birthYear, event.eventYear) : null;
  const yearLabel = event.eventMonth
    ? `${event.eventYear}.${String(event.eventMonth).padStart(2, "0")}`
    : `${event.eventYear}년쯤`;

  function handleClick() {
    const wasLinked = linked;
    setLinked(!wasLinked);
    setToast(null);
    startTransition(async () => {
      if (wasLinked) {
        const r = await unlinkPersonAction(personId, event.id);
        if (!r.ok) {
          setLinked(true);
          setToast({ kind: "error", msg: "연결 해제에 실패했어요." });
          return;
        }
        setToast({ kind: "ok", msg: "연결을 해제했어요." });
      } else {
        const r = await linkPersonAction(personId, event.id);
        if (!r.ok) {
          setLinked(false);
          setToast({ kind: "error", msg: r.error });
          return;
        }
        // LinkResult 4종 분기 — UI 안내.
        switch (r.result) {
          case "linked":
            setToast({ kind: "ok", msg: "이 사건과 연결됐어요." });
            break;
          case "already":
            // 이미 같은 행이 있는 케이스(다른 탭에서 누른 후 새로고침 X 등).
            // 옵티미스틱 토글과 결과가 일치하므로 가벼운 알림만.
            setToast({ kind: "info", msg: "이미 연결된 사건이에요." });
            break;
          case "not_found":
            setLinked(false);
            setToast({
              kind: "error",
              msg: "이 사건을 찾을 수 없어요. 다시 시도해주세요.",
            });
            break;
          case "not_life_event":
            setLinked(false);
            setToast({
              kind: "error",
              msg: "인생 사건이 아니라 연결할 수 없어요.",
            });
            break;
        }
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-base text-zinc-600">
          {yearLabel}
          {age && (
            <span className="ml-2 text-sm text-zinc-500">
              (만 {age.manAge}세)
            </span>
          )}
        </p>
        <p className="mt-1 text-xl font-semibold text-zinc-900">
          {event.title}
        </p>
        {toast && (
          <p
            role="status"
            className={
              "mt-1 text-sm " +
              (toast.kind === "error"
                ? "text-rose-700"
                : toast.kind === "ok"
                  ? "text-emerald-700"
                  : "text-zinc-600")
            }
          >
            {toast.msg}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={linked}
        className={
          "inline-flex min-h-[48px] min-w-[140px] items-center justify-center rounded-md border-2 px-5 py-2 text-base font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
          (linked
            ? "border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
            : "border-zinc-300 bg-white text-zinc-800 hover:border-amber-400 hover:bg-amber-50")
        }
      >
        {linked ? "✓ 연결됨" : "+ 연결하기"}
      </button>
    </li>
  );
}
