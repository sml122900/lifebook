import { redirect } from "next/navigation";

import { auth } from "@/auth";

// Phase L5 — /life-timeline 인증 가드.
// SidePanelLayout 은 app/layout.tsx (root) 로 이동 — 모든 인증 페이지에서
// "내 정보" 토글이 표시되도록 통합. 이 layout 은 auth 체크만 담당한다.

export default async function LifeTimelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <>{children}</>;
}
