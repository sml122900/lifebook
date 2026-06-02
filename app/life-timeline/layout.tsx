import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { loadSidePanelData } from "@/lib/side-panel-data";

import { SidePanelLayout } from "../timemachine/SidePanel";

// Phase L5 — /life-timeline (새 메인) 의 사이드 패널 wrapping.
// /timemachine/layout 과 같은 패턴: lib/side-panel-data.ts 헬퍼로
// 데이터 prepare → SidePanelLayout 에 전달. 사이드 패널 컴포넌트 자체는
// app/timemachine/SidePanel.tsx 를 그대로 재사용 (메뉴 라벨은 v3 흐름
// 반영하도록 거기서 갱신됨).

export default async function LifeTimelineLayout({
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

  return <SidePanelLayout data={data}>{children}</SidePanelLayout>;
}
