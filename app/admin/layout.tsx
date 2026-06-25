import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

// 관리자 권위적 게이트 — ADMIN_EMAILS 일치만 통과(proxy.ts Edge 1차 + 여기 Node
// 재검증). 비관리자·비로그인 → 메인. 일반 사용자·어르신은 절대 도달 X.

export const metadata = { title: "관리자" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) redirect("/life-timeline");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between border-b-2 border-line pb-4">
        <Link href="/admin/orders" className="text-xl font-bold text-ink">
          관리자 · 주문
        </Link>
        <Link href="/life-timeline" className="text-sm text-ink-soft hover:text-ink">
          앱으로 →
        </Link>
      </header>
      {children}
    </div>
  );
}
