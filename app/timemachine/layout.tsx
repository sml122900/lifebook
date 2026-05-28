import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAttendanceStatus } from "@/lib/attendance";
import { getFamilyNewsCount } from "@/lib/family-news";
import { getBalance } from "@/lib/tokens/wallet";

import { SidePanelLayout, type SidePanelData } from "./SidePanel";

// 타임머신 전 화면 공통 — 사이드 패널 한 곳에서 렌더.
// /timemachine 메인과 /timemachine/[year]/[month] 모두 이 layout 의
// children 으로 들어감. 기존 페이지 JSX 는 무변경.
//
// 데이터는 모두 기존 헬퍼 재사용: auth() / getBalance() / getAttendanceStatus().
// 새 API/모델 없음.

// 검증 단계 시드 마지막 — "이번 달" 빠른 이동의 기본 목적지.
// (LATEST_YEAR/MONTH 하드코드는 시드 확장 시 함께 갱신 — CLAUDE.md L8
//  후속 항목과 동일 정책)
const LATEST_YEAR = 2026;
const LATEST_MONTH = 5;

export default async function TimemachineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  // 세 fetch 독립 — 병렬.
  const [balance, attendance, familyNews] = await Promise.all([
    getBalance(userId),
    getAttendanceStatus(userId),
    getFamilyNewsCount(userId),
  ]);

  const data: SidePanelData = {
    userName: session.user.name ?? session.user.email ?? "회원",
    userImage: session.user.image ?? null,
    balance,
    attendance: {
      todayChecked: attendance.todayChecked,
      streak: attendance.streak,
    },
    familyNewsCount: familyNews.total,
    currentMonthHref: `/timemachine/${LATEST_YEAR}/${LATEST_MONTH}`,
  };

  // SidePanelLayout (client) 가 open state + 메인 콘텐츠 wrapper 의
  // lg:pr-80 토글을 함께 다룸. layout RSC 는 데이터만 전달.
  return <SidePanelLayout data={data}>{children}</SidePanelLayout>;
}
