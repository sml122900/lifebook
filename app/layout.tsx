import type { Metadata } from "next";
import Link from "next/link";

import { auth, signOut } from "@/auth";

import "./globals.css";

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

  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-black text-lg leading-relaxed">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4">
          <Link
            href="/"
            className="text-2xl font-bold text-zinc-900 hover:text-zinc-700"
          >
            Lifebook
          </Link>
          {session?.user ? (
            <div className="flex items-center gap-4">
              <span className="hidden text-zinc-800 sm:inline">
                {session.user.name ?? session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
                >
                  로그아웃
                </button>
              </form>
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
      </body>
    </html>
  );
}
