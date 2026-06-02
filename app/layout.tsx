import type { Metadata } from "next";
import Link from "next/link";

import { auth, signOut } from "@/auth";
import { AssistantWidget } from "@/app/components/AssistantWidget";
import { SessionProvider } from "@/app/components/SessionProvider";
import { UserMenu } from "@/app/components/UserMenu";
import { getTheme } from "@/app/components/theme-actions";
import { getBalance } from "@/lib/tokens/wallet";

import "./globals.css";

// 앱 전체의 최상위 레이아웃 (RSC). 모든 페이지 공통 헤더(로고·타임머신·
// 가족 룸·토큰 잔액·계정 메뉴)와 다크모드 클래스를 여기서 그린다.
// 세션·잔액·테마를 서버에서 미리 읽어 헤더에 박는다.

export const metadata: Metadata = {
  title: "Lifebook",
  description: "AI와 함께 채워나가는 나의 인생 연혁표",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  // 비로그인 시 잔액 조회 생략 (null → 헤더에 토큰 수 미표시).
  const balance = session?.user?.id ? await getBalance(session.user.id) : null;
  // 다크모드 여부는 쿠키 기반 (theme-actions). html.dark 클래스로 CSS 변수 swap.
  const theme = await getTheme();

  return (
    <html
      lang="ko"
      className={`h-full antialiased${theme === "dark" ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col bg-white text-black text-lg leading-relaxed">
        <SessionProvider>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4">
          <Link
            href="/"
            className="text-2xl font-bold text-zinc-900 hover:text-zinc-700"
          >
            Lifebook
          </Link>
          {session?.user ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/timemachine"
                className="rounded-md border-2 border-violet-300 bg-violet-50 px-4 py-2 text-base font-semibold text-violet-900 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                타임머신
              </Link>
              <Link
                href="/rooms"
                className="hidden rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 sm:inline-block"
              >
                가족 룸
              </Link>
              <Link
                href="/account/tokens"
                className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                토큰 {balance !== null ? `${balance.toLocaleString()}개` : ""}
              </Link>
              <UserMenu
                label={session.user.name ?? session.user.email ?? "내 계정"}
                logoutAction={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-zinc-900 px-4 py-2 text-base font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            >
              로그인
            </Link>
          )}
        </header>
        {children}
        {/* v3.4 — 글로벌 AI 비서 위젯 (인증된 사용자만 렌더). 위치는 fixed
            bottom-6 right-6. 비인증/세션 X 면 null 반환해 보이지 않는다. */}
        <AssistantWidget />
        </SessionProvider>
      </body>
    </html>
  );
}
