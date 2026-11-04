import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import Link from "next/link";

import "pretendard/dist/web/variable/pretendardvariable.css";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { AssistantWidget } from "@/app/components/AssistantWidget";
import { Footer } from "@/app/components/Footer";
import { PolicyNoticeBar } from "@/app/components/PolicyNoticeBar";
import { ServiceWorkerRegister } from "@/app/components/ServiceWorkerRegister";
import { SessionProvider } from "@/app/components/SessionProvider";
import { SidePanelLayout } from "@/app/timemachine/SidePanel";
import { isNightThemeUser } from "@/lib/night-theme";
import { activeNotice } from "@/lib/policy-notice";
import { loadSidePanelData } from "@/lib/side-panel-data";

import "./globals.css";

// 앱 전체의 최상위 레이아웃 (RSC). 공통 헤더(로고 + 비로그인 로그인 버튼)·
// 사이드 패널(인증 시)·플로팅 AI 비서·푸터를 여기서 그린다. 세션·잔액·
// 출석 등 사이드 패널 데이터를 서버에서 미리 읽어 내린다.

export const metadata: Metadata = {
  // 절대 URL 기준 — og:image 등 상대경로가 이 도메인으로 해석된다.
  metadataBase: new URL("https://lifebook-mauve.vercel.app"),
  title: "Lifebook",
  description: "AI와 함께 채워나가는 나의 인생 연혁표",
  // 카카오톡·문자 링크 미리보기용 기본값. 페이지가 openGraph 를 따로
  // 주면 병합되어 덮어쓴다. og:image 는 app/opengraph-image.tsx 가 자동 생성.
  openGraph: {
    siteName: "Lifebook",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lifebook",
  },
  other: {
    // Next 16 은 표준 mobile-web-app-capable 만 내려주는데, iOS 17.4 이전 Safari
    // (시니어 사용자 다수 해당)는 이 구형 태그가 있어야 홈화면 추가 시 standalone
    // 모드로 열린다.
    "apple-mobile-web-app-capable": "yes",
  },
};

// PWA 홈화면 추가 시 주소창·상태바 색. manifest 의 theme_color/background_color
// 와 동일 값(--color-canvas)으로 맞춤.
export const viewport: Viewport = {
  themeColor: "#faf7f0",
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
  // 처리방침·약관 개정 안내 띠 — 로그인한 화면만(lib/policy-notice, 공지일~시행일 뒤 7일).
  const notice = session?.user ? activeNotice() : null;
  // 밤 우주(docs/phase/ui-night.md N1) — 허용 목록 계정만. 서버가 html 에 그려 첫 그림부터 밤(깜빡임 0).
  const night = isNightThemeUser(session?.user?.id);

  return (
    <html
      lang="ko"
      className={`h-full antialiased ${notoSerif.variable}`}
      data-app-header={sidePanelData ? "" : undefined}
      data-theme={night ? "night" : undefined}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink text-lg leading-relaxed">
        <SessionProvider>
        {/* 로그인한 화면 — 머리 줄을 위에 붙이고(sticky) 오른쪽은 고정 [내 정보] 버튼(app/timemachine/SidePanel) 자리로 비운다.
            스크롤해도 버튼 아래로 글·버튼이 지나가지 않는다(2026-11-04 — 화면마다 겹치던 것을 한 곳에서). 높이 = --app-header-h. */}
        <header
          className={
            sidePanelData
              ? "sticky top-0 z-20 flex h-[var(--app-header-h)] items-center border-b border-line bg-canvas pl-6 pr-44"
              : "flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4"
          }
        >
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
        {notice && <PolicyNoticeBar notice={notice} />}
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
        <ServiceWorkerRegister />
        </SessionProvider>
      </body>
    </html>
  );
}
