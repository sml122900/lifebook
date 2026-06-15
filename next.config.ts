import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // T1 — /poster 가 런타임에 fs 로 읽는 느티나무 마스터 SVG 를 서버리스
  // 번들에 포함(정적 import 가 아니라 추적이 안 되면 Vercel 에서 누락됨).
  outputFileTracingIncludes: {
    "/poster": ["./design/templates/zelkova/*.svg"],
  },
};

export default nextConfig;
