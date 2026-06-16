import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import Link from "next/link";

import "pretendard/dist/web/variable/pretendardvariable.css";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { AssistantWidget } from "@/app/components/AssistantWidget";
import { Footer } from "@/app/components/Footer";
import { SessionProvider } from "@/app/components/SessionProvider";
import { SidePanelLayout } from "@/app/timemachine/SidePanel";
import { loadSidePanelData } from "@/lib/side-panel-data";

import "./globals.css";

// 앱 전체의 최상위 레이아웃 (RSC). 모든 페이지 공통 헤더(로고·
// 가족 룸·토큰 잔액·계정 메뉴)와 다크모드 클래스를 여기서 그린다.
// 세션·잔액·테마를 서버에서 미리 읽어 헤더에 박는다.

export const metadata: Metadata = {
  // 절대 URL 기준 — og:image 등 상대경로가 이 도메인으로 해석된다.
  metadataBase: new URL("https://lifebook-mauve.vercel.app"),
  title: "Lifebook",
  description: "AI와 함께 채워나가는 나의 인생 연혁표",
  // 카카오톡·문자 링크 미리보기용 기본값. 페이지가 openGraph 를 따로
  // 주면 병합되어 덮어쓴다. og:image 는 app/opengraph-image.tsx 가 자동 생성.
  openGraph: {
    siteName: "라이프북",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

// 제목용 명조. globals.css 의 --font-serif(@theme inline)가 이 변수를 참조.
const notoSerif = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-noto-serif-kr",
  display: "swap",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  // 인증된 사용자만 사이드 패널 데이터 로드 (토큰 잔액·출석·가족 소식 포함).
  // 비로그인이면 null → SidePanelLayout 미렌더.
  const sidePanelData = session?.user?.id
    ? await loadSidePanelData({
        userId: session.user.id,
        userName: session.user.name,
        userEmail: session.user.email,
        userImage: session.user.image,
      })
    : null;

  return (
    <html lang="ko" className={`h-full antialiased ${notoSerif.variable}`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink text-lg leading-relaxed">
        <SessionProvider>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <Link
            href="/"
            className="text-2xl font-bold text-ink hover:text-ink-soft"
          >
            Lifebook
          </Link>
          {!session?.user && (
            <ButtonLink href="/login" variant="secondary">
              로그인
            </ButtonLink>
          )}
        </header>
        {/* 인증된 사용자 — 사이드 패널로 감싸서 모든 페이지에 "내 정보" 토글 제공.
            비인증 페이지(로그인·동의 등)는 그대로 통과. */}
        {sidePanelData ? (
          <SidePanelLayout data={sidePanelData}>{children}</SidePanelLayout>
        ) : (
          children
        )}
        {/* v3.4 — 글로벌 AI 비서 위젯 (인증된 사용자만 렌더). 위치는 fixed
            bottom-6 right-6. 비인증/세션 X 면 null 반환해 보이지 않는다. */}
        <AssistantWidget />
        <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
