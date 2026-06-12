import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { getAttendanceStatus } from "@/lib/attendance";
import { getBalance } from "@/lib/tokens/wallet";

import {
  AttendanceCard,
  type AttendanceInitial,
} from "@/app/timemachine/AttendanceCard";

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
  refund: "환불",
  voice_cleanup: "음성 다듬기",
  daily_attendance: "매일 출석",
  attendance_streak_bonus: "연속 출석 보너스",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TokensPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  // 세 fetch 독립 — 병렬.
  const [balance, attendance, txs] = await Promise.all([
    getBalance(userId),
    getAttendanceStatus(userId),
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

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
          출석체크로 매일 받고, 부족하면 충전할 수 있어요.
        </p>
      </header>

      {/* 잔액 — 주인공 */}
      <section className="rounded-md border-2 border-amber-300 bg-amber-50 p-6 text-center">
        <p className="text-base font-semibold text-ink-soft">남은 토큰</p>
        <p className="mt-2 text-5xl font-bold text-amber-900 sm:text-6xl">
          {balance.toLocaleString()}
          <span className="ml-2 text-2xl font-semibold text-amber-800">
            개
          </span>
        </p>
        <ButtonLink
          href="/billing"
          variant="primary"
          size="lg"
          className="mt-5"
        >
          토큰 충전하러 가기
        </ButtonLink>
      </section>

      {/* 출석체크 카드 */}
      <AttendanceCard initial={attendanceInitial} />

      {/* 거래 내역 — 50건 */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">거래 내역</h2>
        {txs.length === 0 ? (
          <p className="text-lg text-ink-soft">아직 내역이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-zinc-200 overflow-hidden rounded-md border-2 border-line bg-surface">
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
                      {DATE_FMT.format(t.createdAt)}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-2xl font-bold tabular-nums " +
                      (positive ? "text-emerald-700" : "text-rose-700")
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
