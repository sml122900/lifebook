import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { loadSidePanelData } from "@/lib/side-panel-data";

import { SidePanelLayout } from "../timemachine/SidePanel";

// 시대 연혁 둘러보기(/era) 의 사이드 패널 wrapping.
// /life-timeline / /timemachine 과 같은 패턴 — 인증 가드 + 패널 데이터
// prefetch → SidePanelLayout. 사이드 패널 컴포넌트 자체는 재사용.

export default async function EraLayout({
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
