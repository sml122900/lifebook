"use client";

import { useState, useTransition } from "react";

import {
  STAMP_KINDS,
  STAMPS,
  type StampKind,
} from "@/lib/reactions-policy";

import { setReactionAction } from "./reaction-actions";

// 동기부여 ② — 감정 스탬프 바. 한 탭 반응 (큰 버튼, 시니어 친화).
//
// 토글은 클라가 현재 상태의 반대(active)를 서버에 보낸다 — 서버는
// create/deleteMany 라 동시·중복 클릭에도 idempotent (경합 창 없음).
// 옵티미스틱: 누르는 즉시 반영, 실패 시 되돌림.

type Counts = Record<StampKind, number>;
type Mine = Record<StampKind, boolean>;

export function StampBar({
  roomId,
  targetType,
  targetId,
  initialCounts,
  initialMine,
}: {
  roomId: string;
  targetType: "user_memory" | "shared_memory";
  targetId: string;
  initialCounts: Counts;
  initialMine: Mine;
}) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [mine, setMine] = useState<Mine>(initialMine);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(stamp: StampKind) {
    const nextActive = !mine[stamp];
    // 옵티미스틱 반영
    setError(null);
    setMine((m) => ({ ...m, [stamp]: nextActive }));
    setCounts((c) => ({
      ...c,
      [stamp]: Math.max(0, c[stamp] + (nextActive ? 1 : -1)),
    }));

    startTransition(async () => {
      try {
        await setReactionAction({
          roomId,
          targetType,
          targetId,
          stamp,
          active: nextActive,
        });
      } catch (e) {
        console.error("[stamp]", e);
        // 되돌림
        setMine((m) => ({ ...m, [stamp]: !nextActive }));
        setCounts((c) => ({
          ...c,
          [stamp]: Math.max(0, c[stamp] + (nextActive ? -1 : 1)),
        }));
        setError("반응을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="mt-4 border-t-2 border-zinc-200 pt-4">
      <p className="mb-2 text-base font-semibold text-zinc-700">
        가볍게 마음 전하기
      </p>
      <ul className="flex flex-wrap gap-2">
        {STAMP_KINDS.map((stamp) => {
          const active = mine[stamp];
          const count = counts[stamp];
          const s = STAMPS[stamp];
          return (
            <li key={stamp}>
              <button
                type="button"
                onClick={() => toggle(stamp)}
                disabled={isPending}
                aria-pressed={active}
                className={
                  "inline-flex min-h-[56px] items-center gap-2 rounded-md border-2 px-4 py-2 text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
                  (active
                    ? "border-amber-600 bg-amber-100 text-amber-900"
                    : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50")
                }
              >
                <span aria-hidden className="text-2xl">
                  {s.emoji}
                </span>
                <span>{s.label}</span>
                {count > 0 && (
                  <span
                    className={
                      "ml-1 inline-flex min-w-[28px] justify-center rounded-full px-2 text-base font-bold " +
                      (active
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-200 text-zinc-800")
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-2 text-base text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
