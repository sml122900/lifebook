"use client";

// CharacterStage 가 motionEnabled=true 일 때만 next/dynamic(ssr:false) 으로
// 불러오는 조각 — lottie-react 는 이 파일에서만 import 해서, 애니메이션을 끈
// 사용자·SSR 에는 번들이 안 실린다.

import { Lottie } from "lottie-react";

export default function CharacterLottiePlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return <Lottie src={src} loop autoplay renderer="svg" className={className} />;
}
