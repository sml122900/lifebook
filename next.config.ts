import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /poster 가 런타임에 fs 로 읽는 템플릿 마스터 SVG 를 서버리스 번들에 포함
  // (정적 import 가 아니라 추적이 안 되면 Vercel 에서 누락됨). 종 추가 시
  // 폴더만 늘면 되도록 templates 하위 전체 svg 를 글롭으로 잡는다.
  outputFileTracingIncludes: {
    "/poster": ["./design/templates/**/*.svg"],
  },
  // 옛 온보딩 화면(2026-11-03 삭제 — 앱 안 진입 링크 0, docs/phase/my-life-restructure.md §15.4). 직접 주소·옛 북마크는
  // /enter(트랙·동의에 맞는 첫 화면)로. proxy 보다 먼저 돈다 — /enter 에서 로그인·동의 확인.
  async redirects() {
    return ["/onboarding-v2", "/onboarding-confirm", "/onboarding-episode", "/onboarding-episode-chat/:eventId"].map((source) => ({
      source,
      destination: "/enter",
      permanent: false,
    }));
  },
};

export default nextConfig;
