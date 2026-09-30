import type { Metadata } from "next";

import { requireLabPage } from "@/lib/lab/access";

// 기억 에이전트 연구실 — 허용 목록 계정만(lib/lab/gate.ts). 비허용 로그인 사용자는
// 없는 주소와 똑같은 404, 비로그인은 기존 proxy 로그인 게이트가 먼저 막는다.
// 메뉴·링크 진입로 없음(주소 직접 입력만), 검색엔진 색인 금지.
//
// ⚠️ 레이아웃은 클라이언트 이동 때 다시 실행되지 않을 수 있다(부분 렌더링). 그래서
// 레이아웃 검사만 믿지 않고 모든 page.tsx 도 requireLabPage() 를 직접 부른다
// (db/test-lab-gate.ts 가 정적 검사로 강제).

export const metadata: Metadata = {
  title: "기억 연구실",
  robots: { index: false, follow: false },
};

export default async function LabMemoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLabPage();
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>;
}
