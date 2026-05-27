import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAttendanceStatus } from "@/lib/attendance";

import {
  AttendanceCard,
  type AttendanceInitial,
} from "./AttendanceCard";

// Phase A — 타임머신 메인 = 출석체크 + "이번 달로 가기".
// (이전엔 즉시 /timemachine/2026/5 로 redirect 만 했음. 이제 매일 한 번
// 들르는 자연스러운 흐름을 위해 메인 화면을 둠.)
//
// 사용자가 URL 로 /timemachine/[year]/[month] 에 직접 들어가는 흐름은
// 그대로 동작 — 회귀 없음.

// 검증 단계 시드 범위 — 가장 최근 달로 보내는 링크 (옛 LATEST 와 동일).
const LATEST_YEAR = 2026;
const LATEST_MONTH = 5;

export default async function TimemachineHomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const status = await getAttendanceStatus(userId);
  const initial: AttendanceInitial = {
    todayChecked: status.todayChecked,
    streak: status.streak,
    daysUntilNextBonus: status.daysUntilNextBonus,
  };

  const userName = session.user.name ?? session.user.email ?? "회원";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          타임머신
        </h1>
        <p className="mt-3 text-xl text-zinc-800 sm:text-2xl">
          <b>{userName}</b>님, 오늘도 와주셔서 고마워요.
        </p>
      </header>

      <AttendanceCard initial={initial} />

      <Link
        href={`/timemachine/${LATEST_YEAR}/${LATEST_MONTH}`}
        prefetch
        className="inline-flex min-h-[80px] items-center justify-center rounded-md bg-violet-700 px-8 py-5 text-2xl font-bold text-white hover:bg-violet-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        이번 달 보러 가기 →
      </Link>
    </main>
  );
}
