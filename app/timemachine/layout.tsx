import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { loadSidePanelData } from "@/lib/side-panel-data";

import { SidePanelLayout } from "./SidePanel";

// 타임머신 전 화면 공통 — 사이드 패널 한 곳에서 렌더.
// /timemachine 메인(L5 부터는 redirect)과 /timemachine/[year]/[month] 모두
// 이 layout 의 children 으로 들어감. 기존 페이지 JSX 는 무변경.
//
// 데이터는 lib/side-panel-data.ts 헬퍼로 모아 둠 — /life-timeline 의
// 같은 사이드 패널과 중복 0.

export default async function TimemachineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const data = await loadSidePanelData({
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    userImage: session.user.image,
  });

  // SidePanelLayout (client) 가 open state + 메인 콘텐츠 wrapper 의
  // lg:pr-80 토글을 함께 다룸. layout RSC 는 데이터만 전달.
  return <SidePanelLayout data={data}>{children}</SidePanelLayout>;
}
