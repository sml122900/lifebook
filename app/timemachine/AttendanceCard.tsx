"use client";

import { useState, useTransition } from "react";

import {
  attendanceCycleEarnedTokens,
  attendanceCyclePosition,
  BONUS_CREDIT,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
  type CheckInResult,
} from "@/lib/attendance-policy";

import { checkInAction } from "./attendance-actions";

// Phase — 출석체크 카드.
// 데이터/정책/로직 무변경. **시각만** 개편: 동그라미 7개 진행도 + 보상 표.
//
// 시니어 친화:
//   - 끊긴 streak 도 비난·압박 표현 X. "오늘도 와주셨네요!" 톤 유지.
//   - 동그라미 충분히 크게 (최소 48px).
//   - 다크모드 자동 (globals.css 의 amber/zinc swap).

export type AttendanceInitial = {
  todayChecked: boolean;
  streak: number;
  daysUntilNextBonus: number;
};

export function AttendanceCard({ initial }: { initial: AttendanceInitial }) {
  const [state, setState] = useState<AttendanceInitial>(initial);
  const [justChecked, setJustChecked] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await checkInAction();
        setJustChecked(r);
        setState({
          todayChecked: true,
          streak: r.streak,
          daysUntilNextBonus: r.daysUntilNextBonus,
        });
      } catch (e) {
        console.error("[attendance]", e);
        setError("출석체크에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  const { todayChecked, streak } = state;
  const cyclePos = attendanceCyclePosition(streak);
  const earned = attendanceCycleEarnedTokens(streak);

  // 오늘 받으면 보너스 받게 되는 자리인지 (= 다음 streak 가 7배수)
  const willBeBonus =
    !todayChecked &&
    attendanceCyclePosition(streak + 1) === BONUS_EVERY_DAYS;

  return (
    <section
      className="flex flex-col gap-5 rounded-md border-2 border-amber-300 bg-amber-50 p-6"
      aria-labelledby="attendance-heading"
    >
      {/* 상단 — 제목 + 연속 표시 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="attendance-heading"
          className="text-2xl font-bold text-zinc-900 sm:text-3xl"
        >
          출석체크
        </h2>
        <p className="text-lg font-bold text-amber-900 sm:text-xl">
          {streak > 0 ? (
            <>
              <span className="text-2xl sm:text-3xl">{streak}</span>일 연속 출석중
            </>
          ) : (
            "오늘부터 시작해 보세요"
          )}
        </p>
      </div>

      {/* 동그라미 7개 진행도 */}
      <CycleDots
        cyclePos={cyclePos}
        todayChecked={todayChecked}
      />

      {/* 이번 사이클 N/7일 */}
      <p className="text-center text-sm text-zinc-700">
        이번 사이클 {cyclePos}/{BONUS_EVERY_DAYS}일
      </p>

      {/* 보상 표 */}
      <div
        className="rounded-md border-2 border-amber-200 bg-white p-4"
        aria-labelledby="reward-heading"
      >
        <p id="reward-heading" className="text-sm font-semibold text-zinc-700">
          이번 사이클 보상
        </p>
        <dl className="mt-2 flex flex-col gap-1.5 text-base">
          <RewardRow label="매일 출석" value={`${DAILY_CREDIT}토큰`} />
          <RewardRow
            label={`${BONUS_EVERY_DAYS}일 연속 보너스`}
            value={`+${BONUS_CREDIT}토큰`}
          />
          <div className="my-1 border-t-2 border-zinc-200" />
          <RewardRow
            label="지금까지 받은 토큰"
            value={`${earned.toLocaleString()}토큰`}
            emphasize
          />
        </dl>
      </div>

      {/* 결과 / 안내 */}
      {justChecked && !justChecked.alreadyChecked && (
        <p
          className="rounded-md border-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-900"
          role="status"
        >
          {justChecked.bonusCredit > 0
            ? `${streak}일 연속 출석! 오늘은 ${justChecked.baseCredit}토큰 + 보너스 ${justChecked.bonusCredit}토큰을 받으셨어요. (잔액 ${justChecked.balanceAfter.toLocaleString()}토큰)`
            : `오늘 출석 완료! ${justChecked.baseCredit}토큰 받으셨어요. (잔액 ${justChecked.balanceAfter.toLocaleString()}토큰)`}
        </p>
      )}
      {todayChecked && !justChecked && (
        <p className="rounded-md border-2 border-emerald-300 bg-white px-4 py-3 text-base text-emerald-900">
          오늘은 이미 받으셨어요. 내일 다시 와주세요.
        </p>
      )}
      {error && (
        <p
          className="rounded-md border-2 border-rose-300 bg-white px-4 py-3 text-base text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* 액션 버튼 */}
      {todayChecked ? (
        <button
          type="button"
          disabled
          className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-zinc-300 px-8 py-4 text-xl font-bold text-zinc-700"
          aria-disabled="true"
        >
          오늘 출석 완료!
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-amber-700 px-8 py-4 text-xl font-bold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isPending
            ? "처리 중…"
            : willBeBonus
              ? `오늘 출석체크하기 (${DAILY_CREDIT}토큰 + 보너스 ${BONUS_CREDIT}토큰!)`
              : `오늘 출석체크하기 (${DAILY_CREDIT}토큰)`}
        </button>
      )}
    </section>
  );
}

function CycleDots({
  cyclePos,
  todayChecked,
}: {
  cyclePos: number;
  todayChecked: boolean;
}) {
  // 7개 슬롯. i (1-indexed) ≤ cyclePos 면 채움.
  // 마지막 채워진 자리 + todayChecked → "오늘" 강조 (ring).
  return (
    <ol
      className="flex items-center justify-between gap-1 sm:gap-2"
      aria-label={`이번 사이클 ${cyclePos} / ${BONUS_EVERY_DAYS}일 진행`}
    >
      {Array.from({ length: BONUS_EVERY_DAYS }).map((_, idx) => {
        const day = idx + 1;
        const filled = day <= cyclePos;
        const isToday = todayChecked && day === cyclePos;
        const isBonusSlot = day === BONUS_EVERY_DAYS;
        return (
          <li
            key={day}
            className="flex flex-col items-center gap-1"
            aria-label={
              filled
                ? `${day}일째 출석 완료${isBonusSlot ? " (보너스)" : ""}`
                : `${day}일째 아직`
            }
          >
            <div
              className={
                "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all sm:h-14 sm:w-14 " +
                (filled
                  ? "border-amber-700 bg-amber-700 text-white shadow"
                  : "border-zinc-300 bg-white text-zinc-400") +
                (isToday ? " ring-4 ring-amber-300 ring-offset-2" : "")
              }
            >
              {filled ? (
                <span aria-hidden className="text-xl font-bold">
                  ✓
                </span>
              ) : (
                <span aria-hidden className="text-base font-semibold">
                  {day}
                </span>
              )}
            </div>
            {isBonusSlot && (
              <span className="text-[10px] font-semibold text-amber-900 sm:text-xs">
                +{BONUS_CREDIT}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RewardRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt
        className={
          emphasize
            ? "text-base font-bold text-zinc-900"
            : "text-base text-zinc-700"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "text-base font-bold text-amber-900"
            : "text-base font-semibold text-zinc-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
