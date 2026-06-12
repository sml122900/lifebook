"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { dismissWelcomeAction } from "./welcome-actions";

// 첫 방문 환영 카드 — 첫 행동 하나만 제시하는 1회성 안내.
//
// 표시 조건은 page.tsx(RSC)가 결정 (onboardingCompletedAt == null && 이벤트 0).
// [시작하기]·[닫기] 모두 dismissWelcomeAction 으로 종료 표시 → 재방문 시 안 뜸.
// 시니어 친화: 큰 글씨·큰 버튼(56px+)·따뜻한 톤(amber), 압박색 X.

const V3_BANNER_KEY = "v3-welcome-seen";

export function WelcomeCard({ userName }: { userName: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [starting, setStarting] = useState(false);

  // 환영 카드를 본 사용자에게 V3WelcomeBanner("새로워졌어요")가 연이어 뜨면
  // 배너 두 장 연속 — 신규 사용자에겐 의미도 없어 localStorage 로 함께 끔.
  function markV3BannerSeen() {
    try {
      window.localStorage.setItem(V3_BANNER_KEY, "1");
    } catch {
      // localStorage 막힌 환경이어도 카드 동작엔 지장 없음.
    }
  }

  async function onStart() {
    setStarting(true);
    markV3BannerSeen();
    try {
      await dismissWelcomeAction();
    } catch (e) {
      console.error("[welcome-dismiss]", e);
    }
    router.push("/life-timeline/add");
  }

  async function onDismiss() {
    setHidden(true); // 옵티미스틱 — 즉시 숨김
    markV3BannerSeen();
    try {
      await dismissWelcomeAction();
    } catch (e) {
      console.error("[welcome-dismiss]", e);
    }
  }

  if (hidden) return null;

  return (
    <section
      aria-label="환영 안내"
      className="flex flex-col gap-5 rounded-md border-2 border-brand bg-banner px-6 py-7"
    >
      <div>
        <h2 className="text-3xl font-bold text-action sm:text-4xl">
          {userName}님, 환영해요.
        </h2>
        <p className="mt-2 text-xl text-action sm:text-2xl">
          인생의 한 장면부터 하나 적어볼까요?
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className={buttonClasses(
            "primary",
            "lg",
            "flex-1 text-xl sm:flex-initial sm:px-10",
          )}
        >
          {starting ? "여는 중…" : "시작하기"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={buttonClasses("tertiary", "lg")}
        >
          닫기
        </button>
      </div>
    </section>
  );
}
