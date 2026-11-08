import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 옛 온보딩 화면(2026-11-03 삭제 — 앱 안 진입 링크 0, docs/phase/my-life-restructure.md §15.4). 직접 주소·옛 북마크는
  // /enter(트랙·동의에 맞는 첫 화면)로. proxy 보다 먼저 돈다 — /enter 에서 로그인·동의 확인.
  // 인물 확인 화면(2026-11-03 삭제 — 확인 대기 0·만드는 경로 0, §15.6)은 /my-life 로.
  async redirects() {
    return [
      ...["/onboarding-v2", "/onboarding-confirm", "/onboarding-episode", "/onboarding-episode-chat/:eventId"].map((source) => ({
        source,
        destination: "/enter",
        permanent: false,
      })),
      { source: "/story-review/confirm", destination: "/my-life", permanent: false },
      // 강물 포스터(2026-11-08 판매 종료 — 그리기 코드 삭제, docs/phase/print-mylife.md §9) → My Life 인쇄본 출력 편집(V2 는 거기서 /enter).
      { source: "/poster", destination: "/my-life/print", permanent: false },
      { source: "/poster/:path*", destination: "/my-life/print", permanent: false },
    ];
  },
};

export default nextConfig;
