"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  attendanceCyclePosition,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
} from "@/lib/attendance-policy";

import { checkInAction } from "./attendance-actions";
import { logoutAction } from "./logout-action";

// 타임머신 사이드 패널 + 레이아웃 wrapper.
//
// SidePanelLayout (export 기본 사용처: layout.tsx):
//   - open state + localStorage 한 곳에서 관리
//   - children(메인 콘텐츠) wrapper 의 lg:pr-80 을 open 따라 토글
//   - SidePanel 본체에 open/onToggle props 내림
//
// SidePanel:
//   - 프로필 / 잔액 / 충전 / 출석 / 메뉴 / 로그아웃
//   - 데스크톱: 항상 fixed right. closed 면 translate 로 가림.
//   - 모바일: 평소 닫힘, 햄버거(=내 정보) 버튼으로 열림. 백드롭 클릭 닫힘.
//
// 데이터는 모두 RSC layout 이 props 로 내림 — 새 API/모델 없음.

const STORAGE_KEY = "timemachine-sidebar";

export type SidePanelData = {
  userName: string;
  userImage: string | null;
  balance: number;
  attendance: {
    todayChecked: boolean;
    streak: number;
  };
  familyNewsCount: number;
  currentMonthHref: string;
};

export function SidePanelLayout({
  data,
  children,
}: {
  data: SidePanelData;
  children: React.ReactNode;
}) {
  // 첫 방문 = 열림. localStorage "closed" 일 때만 닫힘.
  // SSR 은 항상 true 로 그림 → mount 후 보정. 깜빡임 최소화 위해
  // transition 도 mount 후에만 활성.
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
    if (stored === "closed") setOpen(false);
    setMounted(true);
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
    }
  }

  return (
    <>
      {/* 메인 콘텐츠 — 사이드 열림 + 데스크톱일 때만 우측 패딩 (320px=w-80) */}
      <div className={open ? "lg:pr-80" : ""}>{children}</div>
      <SidePanel
        data={data}
        open={open}
        mounted={mounted}
        onToggle={toggle}
      />
    </>
  );
}

function SidePanel({
  data,
  open,
  mounted,
  onToggle,
}: {
  data: SidePanelData;
  open: boolean;
  mounted: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <>
      {/* 햄버거 / "내 정보" 버튼 — 사이드 닫혀있을 때만, 모든 화면.
          새 가족 소식이 있으면 개수 뱃지 — 패널 안 열어도 눈에 띄게. */}
      {!open && (
        <button
          type="button"
          onClick={() => onToggle(true)}
          aria-label={
            data.familyNewsCount > 0
              ? `내 정보 패널 열기 (새 가족 소식 ${data.familyNewsCount}개)`
              : "내 정보 패널 열기"
          }
          className="fixed right-4 top-4 z-30 inline-flex min-h-[48px] items-center gap-2 rounded-md border-2 border-amber-500 bg-white px-4 py-2 text-base font-semibold text-amber-900 shadow-md hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <span aria-hidden>≡</span>
          내 정보
          {data.familyNewsCount > 0 && (
            <span
              aria-hidden
              className="inline-flex min-w-[24px] justify-center rounded-full bg-amber-700 px-2 text-sm font-bold text-white"
            >
              {data.familyNewsCount}
            </span>
          )}
        </button>
      )}

      {/* 모바일 백드롭 — 사이드 열림 + lg 미만에서만 */}
      {open && (
        <button
          type="button"
          aria-label="패널 닫기"
          onClick={() => onToggle(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {/* 사이드 패널 본체 */}
      <aside
        aria-label="내 정보 사이드 패널"
        aria-hidden={!open}
        className={
          "fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] overflow-y-auto border-l-2 border-amber-200 bg-white p-6 shadow-xl transition-transform " +
          (mounted ? "" : "!transition-none ") +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        {/* 헤더 + 닫기 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">내 정보</h2>
          <button
            type="button"
            onClick={() => onToggle(false)}
            aria-label="패널 닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-zinc-300 text-xl font-bold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
          >
            ✕
          </button>
        </div>

        {/* 1. 프로필 */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {data.userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.userImage}
              alt=""
              className="h-20 w-20 rounded-full border-2 border-amber-200 object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-3xl font-bold text-amber-800"
            >
              {(data.userName.trim()[0] ?? "?").toUpperCase()}
            </div>
          )}
          <p className="text-center text-lg font-semibold text-zinc-900">
            {data.userName}
          </p>
        </div>

        {/* 2. 토큰 잔액 */}
        <div className="mt-6 rounded-md border-2 border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-semibold text-zinc-700">내 토큰</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {data.balance.toLocaleString()}
            <span className="ml-1 text-base font-semibold text-amber-800">토큰</span>
          </p>
        </div>

        {/* 3. 충전 버튼 */}
        <Link
          href="/billing"
          className="mt-3 inline-flex w-full min-h-[56px] items-center justify-center rounded-md bg-amber-700 px-4 py-3 text-lg font-bold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          토큰 충전하기
        </Link>

        {/* 3.5 새 가족 소식 — 있을 때만 (0건이면 서운한 표현 없이 숨김) */}
        {data.familyNewsCount > 0 && (
          <Link
            href="/timemachine"
            className="mt-4 flex items-center justify-between rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <span className="text-base font-bold text-amber-900">
              새 가족 소식
            </span>
            <span className="inline-flex min-w-[28px] justify-center rounded-full bg-amber-700 px-2 py-0.5 text-base font-bold text-white">
              {data.familyNewsCount}
            </span>
          </Link>
        )}

        {/* 4. 출석 현황 */}
        <AttendanceMini
          todayChecked={data.attendance.todayChecked}
          streak={data.attendance.streak}
        />

        {/* 5. 빠른 이동 메뉴 */}
        <nav className="mt-6 flex flex-col gap-2" aria-label="빠른 이동">
          <p className="px-2 text-sm font-semibold text-zinc-600">빠른 이동</p>
          <MenuItem
            href={data.currentMonthHref}
            label="이번 달 타임머신"
            hint="가장 최근 달로"
          />
          <MenuItem
            href="/timemachine"
            label="내 기록"
            hint="지금까지 쌓인 이야기"
          />
          <MenuItem
            href="/rooms"
            label="가족 룸"
            hint="가족·배우자와 함께 보기"
          />
          <MenuItem
            href="/account/profile"
            label="회원정보"
            hint="이름·생년·지역 확인"
          />
          <MenuItem
            href="/account/settings"
            label="설정"
            hint="다크모드·계정 관리"
          />
        </nav>

        {/* 6. 로그아웃 — 다른 메뉴보다 눈에 덜 띄게 */}
        <form
          action={logoutAction}
          className="mt-8 border-t-2 border-zinc-200 pt-4"
        >
          <button
            type="submit"
            className="text-sm text-zinc-500 hover:text-zinc-700 hover:underline focus:outline-none focus-visible:underline"
          >
            로그아웃
          </button>
        </form>
      </aside>
    </>
  );
}

function MenuItem({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-md border-2 border-zinc-200 bg-white px-4 py-3 hover:bg-amber-50 hover:border-amber-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      <span className="text-base font-semibold text-zinc-900">{label}</span>
      <span className="mt-0.5 text-xs text-zinc-600">{hint}</span>
    </Link>
  );
}

function AttendanceMini({
  todayChecked,
  streak,
}: {
  todayChecked: boolean;
  streak: number;
}) {
  const [done, setDone] = useState(todayChecked);
  const [currentStreak, setCurrentStreak] = useState(streak);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await checkInAction();
        setDone(true);
        setCurrentStreak(r.streak);
      } catch (e) {
        console.error("[sidebar-attendance]", e);
        setError("출석체크에 실패했어요.");
      }
    });
  }

  const cyclePos = attendanceCyclePosition(currentStreak);

  return (
    <div className="mt-6 rounded-md border-2 border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-700">오늘의 출석</p>
      <p className="mt-1 text-2xl font-bold text-amber-900">
        연속 {currentStreak}일째
      </p>

      {/* 사이드는 좁아서 동그라미 작게 (16px). 텍스트 N/7 병행. */}
      <ol
        className="mt-2 flex items-center gap-1"
        aria-label={`이번 사이클 ${cyclePos} / ${BONUS_EVERY_DAYS}일`}
      >
        {Array.from({ length: BONUS_EVERY_DAYS }).map((_, idx) => {
          const day = idx + 1;
          const filled = day <= cyclePos;
          const isToday = done && day === cyclePos;
          return (
            <li
              key={day}
              className={
                "h-4 w-4 rounded-full border-2 " +
                (filled
                  ? "border-amber-700 bg-amber-700"
                  : "border-zinc-300 bg-white") +
                (isToday ? " ring-2 ring-amber-300" : "")
              }
              aria-hidden
            />
          );
        })}
        <span className="ml-1 text-xs text-zinc-600">
          {cyclePos}/{BONUS_EVERY_DAYS}
        </span>
      </ol>

      {done ? (
        <p className="mt-2 text-sm text-emerald-700">오늘은 받으셨어요 ✓</p>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="mt-2 inline-flex w-full min-h-[44px] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "처리 중…" : `오늘 ${DAILY_CREDIT}토큰 받기`}
        </button>
      )}
      {error && (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
