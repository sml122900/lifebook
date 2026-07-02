import type { MetadataRoute } from "next";

// PWA 매니페스트 (Next.js 네이티브 파일 컨벤션 — /manifest.webmanifest 로 자동
// 서빙 + layout <head> 에 <link rel="manifest"> 자동 삽입, 추가 코드 불필요).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lifebook — 인생 기록",
    short_name: "Lifebook",
    description: "말로 이야기하면 AI가 인생 포스터를 만들어드려요",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f0",
    theme_color: "#faf7f0",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
