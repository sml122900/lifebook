import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /poster 가 런타임에 fs 로 읽는 템플릿 마스터 SVG 를 서버리스 번들에 포함
  // (정적 import 가 아니라 추적이 안 되면 Vercel 에서 누락됨). 종 추가 시
  // 폴더만 늘면 되도록 templates 하위 전체 svg 를 글롭으로 잡는다.
  outputFileTracingIncludes: {
    "/poster": ["./design/templates/**/*.svg"],
  },
  // P5-5c — 맞춤배경 "결정" 시 base64 PNG 를 서버 액션 인자로 넘긴다(최대
  // 디코딩 12MB → base64 ~16MB). 기본 1MB 한도면 큰 그림에서 503 으로 막힘.
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
