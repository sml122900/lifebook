import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { getAttendanceStatus } from "@/lib/attendance";
import { KST_DATE_LONG_FMT, KST_DATE_TIME_FMT } from "@/lib/kst-date";
import { getTopupQuotes } from "@/lib/tokens/refund-exec";
import { getBalance } from "@/lib/tokens/wallet";

import {
  AttendanceCard,
  type AttendanceInitial,
} from "@/app/timemachine/AttendanceCard";
import { TOPUP_OPEN } from "@/lib/tokens/policy";

// v3.5 — 토큰 · 출석체크 통합 페이지.
//
// 기존:
//   - /life-timeline 메인에 AttendanceCard 가 박혀 있었음 → 메인이 무거워짐
//   - /billing 은 충전 패키지 + 거래내역. 잔액 표시는 헤더와 분산
//
// 이 페이지:
//   - 큰 잔액 표시(주인공)
//   - 매일의 출석체크 카드 (5토큰 + 7배수 보너스)
//   - 거래 내역 50건
//   - "충전하러 가기" 버튼 → /billing (결제 UI 는 변경 0)
//
// 설정 페이지(/account/settings) 에 "토큰" 카드로 진입 + 헤더 잔액 버튼 +
// 사이드 패널의 잔액 카드 모두 이 페이지로 통일된다.
//
// 시니어 친화: 매일 들르는 페이지가 명확 — 잔액·출석·내역 한 화면.

// 거래 사유별 한국어 라벨. /billing 과 동일 매핑(중복 — 운영 시 통합 검토).
const REASON_LABEL: Record<string, string> = {
  signup_grant: "가입 무료 지급",
  ai_charge: "추억 정리",
  topup: "토큰 충전",
  topup_refund: "충전 환불", // 2026-11-10 — 고객센터 요청 → 관리자 환불(lib/tokens/refund-exec)
  refund: "환불",
  voice_cleanup: "음성 다듬기",
  daily_attendance: "매일 출석",
  attendance_streak_bonus: "연속 출석 보너스",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

export default async function TokensPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  // 네 fetch 독립 — 병렬.
  const [balance, attendance, txs, topups] = await Promise.all([
    getBalance(userId),
    getAttendanceStatus(userId),
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getTopupQuotes(userId), // 충전 토큰 유효기간(충전일로부터 1년 — 2026-11-10) 만료 30일 전 안내
  ]);
  const expiring = topups.quotes.filter((q) => q.expiringSoon).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

  const attendanceInitial: AttendanceInitial = {
    todayChecked: attendance.todayChecked,
    streak: attendance.streak,
    daysUntilNextBonus: attendance.daysUntilNextBonus,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <ButtonLink
        href="/account/settings"
        variant="tertiary"
        className="self-start"
      >
        ← 설정으로
      </ButtonLink>

      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          내 토큰
        </h1>
        <p className="mt-3 text-base text-ink-soft">
          {/* 충전 비공개(2026-11-09 — TOPUP_OPEN) 동안은 충전 말 없이 */}
          {TOPUP_OPEN ? "출석체크로 매일 받고, 부족하면 충전할 수 있어요." : "출석체크로 매일 받을 수 있어요."}
        </p>
      </header>

      {/* 잔액 — 주인공 */}
      <section className="rounded-md border-2 border-line bg-banner p-6 text-center">
        <p className="text-base font-semibold text-ink-soft">남은 토큰</p>
        <p className="mt-2 text-5xl font-bold text-action sm:text-6xl">
          {balance.toLocaleString()}
          <span className="ml-2 text-2xl font-semibold text-action">
            개
          </span>
        </p>
        {TOPUP_OPEN && (
          <ButtonLink
            href="/billing"
            variant="secondary"
            size="lg"
            className="mt-5"
          >
            토큰 충전하러 가기
          </ButtonLink>
        )}
      </section>

      {/* 만료 30일 전 안내(2026-11-10 — 알림 발송 없이 이 화면에만). 문구 [임시 — 성민 확정 필요] */}
      {expiring.length > 0 && (
        <section role="note" aria-labelledby="expiring-title" className="rounded-md border-2 border-brand bg-banner px-5 py-4">
          <h2 id="expiring-title" className="text-xl font-bold text-ink">
            곧 기간이 끝나는 충전 토큰이 있어요
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-lg text-ink">
            {expiring.map((q) => (
              <li key={q.orderId}>
                · {q.remaining.toLocaleString()}토큰 — {KST_DATE_LONG_FMT.format(q.expiresAt)}까지 쓰실 수 있어요
              </li>
            ))}
          </ul>
          <p className="mt-2 text-base text-ink-soft">충전한 토큰은 충전일로부터 1년 동안 쓰실 수 있어요.</p>
        </section>
      )}

      {/* 출석체크 카드 */}
      <AttendanceCard initial={attendanceInitial} />

      {/* 거래 내역 — 50건 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">거래 내역</h2>
        {txs.length === 0 ? (
          <p className="text-lg text-ink-soft">아직 내역이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-md border-2 border-line bg-surface">
            {txs.map((t) => {
              const positive = t.delta >= 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-ink">
                      {reasonLabel(t.reason)}
                    </p>
                    <p className="text-base text-ink-soft">
                      {KST_DATE_TIME_FMT.format(t.createdAt)}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-2xl font-bold tabular-nums " +
                      (positive ? "text-success" : "text-danger")
                    }
                  >
                    {positive ? "+" : ""}
                    {t.delta.toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

export const metadata = {
  title: "내 토큰 — 설정",
};
