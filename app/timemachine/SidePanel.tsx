"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, LifeBuoy, Mic, ShoppingBag } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  attendanceCyclePosition,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
} from "@/lib/attendance-policy";
import { SIDE_PANEL_EVENT, START_TOUR_EVENT } from "@/lib/tours";

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

  // 코치마크 둘러보기가 단계별로 패널을 여닫게 하는 브리지. 투어 전용이라
  // setOpen 만 호출(사용자 localStorage 선호는 건드리지 않음).
  useEffect(() => {
    const onTour = (e: Event) => {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === "boolean") setOpen(detail.open);
    };
    window.addEventListener(SIDE_PANEL_EVENT, onTour);
    return () => window.removeEventListener(SIDE_PANEL_EVENT, onTour);
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
    }
  }

  return (
    <>
      {/* 메인 콘텐츠 — 사이드 열림 + 데스크톱일 때만 우측 패딩 (320px=w-80).
          하단 패딩은 글로벌 AI 비서 FAB(우측 하단 fixed)가 스크롤 끝
          콘텐츠를 가리지 않게(FAB 높이 64 + 여유 + safe-area). 인증 화면
          전부가 이 래퍼를 거치므로 FAB 노출 범위와 정확히 일치. */}
      <div
        className={
          (open ? "lg:pr-80 " : "") +
          "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
        }
      >
        {children}
      </div>
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
          className="fixed right-4 top-4 z-30 inline-flex min-h-[48px] items-center gap-2 rounded-md border-2 border-amber-500 bg-surface px-4 py-2 text-base font-semibold text-amber-900 shadow-md hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
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
          "fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] overflow-y-auto border-l-2 border-amber-200 bg-surface p-6 shadow-xl transition-transform " +
          (mounted ? "" : "!transition-none ") +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        {/* 헤더 + 닫기 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">내 정보</h2>
          <button
            type="button"
            onClick={() => onToggle(false)}
            aria-label="패널 닫기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-line text-xl font-bold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
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
          <p className="text-center text-lg font-semibold text-ink">
            {data.userName}
          </p>
        </div>

        {/* 2. 토큰 잔액 */}
        <div
          data-tour="tokens"
          className="mt-6 rounded-md border-2 border-amber-200 bg-amber-50 p-4 text-center"
        >
          <p className="text-sm font-semibold text-ink-soft">내 토큰</p>
          <p className="mt-1 text-3xl font-bold text-amber-900">
            {data.balance.toLocaleString()}
            <span className="ml-1 text-base font-semibold text-action">토큰</span>
          </p>
        </div>

        {/* 3. 토큰 화면 — 잔액·출석·충전 통합 페이지로 (v3.5) */}
        <Link
          href="/account/tokens"
          className="mt-3 inline-flex w-full min-h-[56px] items-center justify-center rounded-md bg-amber-700 px-4 py-3 text-lg font-bold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          토큰 화면 열기
        </Link>

        {/* 3.5 새 가족 소식 — 있을 때만 (0건이면 서운한 표현 없이 숨김) */}
        {/* L5 — 메인이 /life-timeline 으로 옮겨졌으므로 거기에 보이는
            FamilyNewsCard 로 보낸다. */}
        {data.familyNewsCount > 0 && (
          <Link
            href="/life-timeline"
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
        {/* v3 (2026-06-06) — 월별 타임머신 진입 동선 제거. "작년 사건의
            정확한 월" 은 사용자가 떠올리지 못한다는 통찰에 따라 메인은
            연혁(연/시기 중심) 하나로 통일. 월 화면 라우트는 redirect 로
            살아있으나 사이드 진입로는 닫는다. */}
        <nav className="mt-6 flex flex-col gap-2" aria-label="빠른 이동">
          <p className="px-2 text-sm font-semibold text-ink-soft">빠른 이동</p>
          <MenuItem
            href="/life-timeline"
            label="내 인생 연혁"
            hint="한눈에 보는 인생"
          />
          <MenuItem
            href="/life-timeline/companion"
            label="이야기 나누기"
            hint="말로 풀어놓는 내 이야기"
            icon={<Mic size={16} aria-hidden />}
            dataTour="companion"
          />
          <MenuItem
            href="/era"
            label="그 시절 둘러보기"
            hint="1980~2010년대 큰 사건과 노래"
          />
          <MenuItem
            href="/people"
            label="인물록"
            hint="인생에 등장한 분들"
          />
          <MenuItem
            href="/photos"
            label="내 사진"
            hint="사진 올리고 연혁에 담기"
          />
          <MenuItem
            href="/rooms"
            label="가족 룸"
            hint="가족·배우자와 함께 보기"
          />
          <MenuItem
            href="/shop"
            label="상품 구매"
            hint="포스터·자서전 책·인생 씨앗"
            icon={<ShoppingBag size={16} aria-hidden />}
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
          <MenuItem
            href="/help"
            label="고객센터"
            hint="자주 묻는 질문·이메일 문의"
            icon={<LifeBuoy size={16} aria-hidden />}
          />
          <RerunTourItem />
        </nav>

        {/* 6. 로그아웃 — 다른 메뉴보다 눈에 덜 띄게 */}
        <form
          action={logoutAction}
          className="mt-8 border-t-2 border-line pt-4"
        >
          <button
            type="submit"
            className="text-sm text-ink-faint hover:text-ink-soft hover:underline focus:outline-none focus-visible:underline"
          >
            로그아웃
          </button>
        </form>
      </aside>
    </>
  );
}

// "둘러보기 다시 보기" — 같은 페이지면 이벤트로 즉시 재시작(begin 이 패널을
// 닫고 시작), 다른 페이지면 /life-timeline?tour=main 로 이동해 마운트 시 자동
// 시작. 패널 닫기는 CoachMarks.begin 의 SIDE_PANEL_EVENT 가 처리(비영속).
function RerunTourItem() {
  const router = useRouter();
  const pathname = usePathname();

  function onClick() {
    if (pathname === "/life-timeline") {
      window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));
    } else {
      router.push("/life-timeline?tour=main");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-md border-2 border-line bg-surface px-4 py-3 text-left hover:bg-amber-50 hover:border-amber-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      <span className="flex items-center gap-1.5 text-base font-semibold text-ink">
        <span className="text-ink-soft">
          <Compass size={16} aria-hidden />
        </span>
        둘러보기 다시 보기
      </span>
      <span className="mt-0.5 text-xs text-ink-soft">처음 안내를 다시 봐요</span>
    </button>
  );
}

function MenuItem({
  href,
  label,
  hint,
  icon,
  dataTour,
}: {
  href: string;
  label: string;
  hint: string;
  icon?: React.ReactNode;
  dataTour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className="flex flex-col rounded-md border-2 border-line bg-surface px-4 py-3 hover:bg-amber-50 hover:border-amber-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      <span className="flex items-center gap-1.5 text-base font-semibold text-ink">
        {icon && <span className="text-ink-soft">{icon}</span>}
        {label}
      </span>
      <span className="mt-0.5 text-xs text-ink-soft">{hint}</span>
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
    <div className="mt-6 rounded-md border-2 border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink-soft">오늘의 출석</p>
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
                  : "border-line bg-surface") +
                (isToday ? " ring-2 ring-amber-300" : "")
              }
              aria-hidden
            />
          );
        })}
        <span className="ml-1 text-xs text-ink-soft">
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
          className="mt-2 inline-flex w-full min-h-[48px] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
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
