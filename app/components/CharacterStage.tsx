"use client";

// v3 P5 — /chat-v3 대화 캐릭터 표시 슬롯. 텍스트·터치 영역을 침범하지 않는
// 고정 크기 원형 프레임 안에서만 존재한다(헤더 슬롯 전용, sticky/overlay 없음).
//
// motionEnabled=false(시니어 접근성 — 애니메이션 끄기)면 Lottie 자체를 로드
// 하지 않고 정지 썸네일(SVG)만 그린다 — 저사양 기기·멀미 대응 + 번들 절감.
//
// OS/브라우저의 prefers-reduced-motion 도 같은 취급이다 — lottie-react 는
// reduced-motion 이면 autoplay 뿐 아니라 첫 프레임 페인트도 건너뛰어(실측)
// 우리 앱 토글을 켜둔 사람에게 빈 원만 보이는 게 더 나쁘다. 그래서
// prefers-reduced-motion 이 감지되면 앱 설정과 무관히 정지 썸네일로
// 내려간다.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { getCharacter, type CharacterState } from "@/lib/characters";

const CharacterLottiePlayer = dynamic(() => import("./CharacterLottiePlayer"), {
  ssr: false,
  loading: () => null,
});

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function CharacterStage({
  characterId,
  motionEnabled,
  state,
  size = 64,
}: {
  characterId: string;
  motionEnabled: boolean;
  state: CharacterState;
  size?: number;
}) {
  const character = getCharacter(characterId);
  const prefersReducedMotion = usePrefersReducedMotion();
  const showAnimation = motionEnabled && !prefersReducedMotion;

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-surface"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${character.name} 캐릭터`}
    >
      {showAnimation ? (
        <CharacterLottiePlayer
          key={`${character.id}-${state}`}
          src={character.animations[state]}
          className="h-full w-full"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={character.thumbnailUrl}
          alt=""
          className="h-full w-full object-contain p-2"
        />
      )}
    </div>
  );
}
