"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { unlinkPersonAction } from "../actions";

// Phase P2 — 인물 상세에서 한 이벤트와 연결 해제. 인물도/이벤트도 사라지지
// 않음 — PersonEvent 행 1개만 삭제. confirm 모달 없이 즉시 (실수해도 같은
// 화면에서 다시 누르면 복구 가능, 화면 멀리 안 감).

export function UnlinkButton({
  personId,
  memoryId,
  eventLabel,
}: {
  personId: string;
  memoryId: string;
  eventLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await unlinkPersonAction(personId, memoryId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`${eventLabel} 연결 해제`}
      className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
    >
      {isPending ? "해제 중…" : "연결 해제"}
    </button>
  );
}
