"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { type CoachStep, SIDE_PANEL_EVENT } from "@/lib/tours";

// 공용 코치마크 엔진 — 첫 진입 자동 안내 오버레이.
//
// 어두운 반투명 배경 + 현재 단계의 타겟만 spotlight(구멍) + 화살표 말풍선 +
// 단계 진행("다음"). 어르신 친화: 큰 글씨·쉬운 말·한 번에 하나만.
//
// 재사용: steps 배열 + tourId 만 주면 어느 화면에서든 동작. 타겟은 화면에
// [data-tour="<step.target>"] 속성을 단 요소로 찾는다. 없으면 그 단계는 건너뜀.
//
// spotlight 는 타겟 위치 박스에 거대한 box-shadow 를 줘 주변만 어둡게 만든다.
// → 타겟 자신의 z-index 와 무관하게(사이드 패널 z-50 위로도) 구멍이 뚫린다.

const HOLE_PAD = 8; // 타겟 둘레 여백(px)
const TIP_W = 340; // 말풍선 기준 너비(px, 화면 좁으면 줄어듦)

type Rect = { top: number; left: number; width: number; height: number };

export function CoachMarks({
  steps,
  tourId,
  autoStart,
  onComplete,
}: {
  steps: CoachStep[];
  tourId: string;
  // 서버가 completedTours 게이트로 판단(또는 ?tour= 강제) → true 면 마운트 시 시작.
  autoStart: boolean;
  onComplete: (tourId: string) => void | Promise<void>;
}) {
  const [active, setActive] = useState(autoStart);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const doneRef = useRef(false);

  const step = active ? steps[index] : undefined;

  // 끝/건너뛰기 — 완료 표시 1회만. 패널은 깔끔히 닫고 마무리.
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setActive(false);
    setRect(null);
    window.dispatchEvent(
      new CustomEvent(SIDE_PANEL_EVENT, { detail: { open: false } }),
    );
    void onComplete(tourId);
  }, [onComplete, tourId]);

  // 시작 시 ?tour= 쿼리 정리 — 새로고침에 재시작 안 되게.
  useEffect(() => {
    if (!active) return;
    if (window.location.search.includes("tour=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [active]);

  // 단계 진입 — 패널 상태를 *즉시* 맞추고(재실행 시 열린 패널 먼저 닫기),
  // 타겟이 나타나면 화면 안으로 스크롤한 뒤 위치가 안정될 때까지 매 프레임
  // 재측정한다. 패널 트랜지션(폭 변화·pr-80)·스크롤이 끝나는 동안 spotlight
  // 가 타겟에 정확히 붙도록 — 고정 지연 후 1회 측정의 오차(타겟보다 위 빈
  // 공간을 가리키던 버그)를 없앤다. 타겟이 끝내 없으면 다음 단계로 건너뜀.
  useEffect(() => {
    if (!active || !step) return;
    let raf = 0;
    let cancelled = false;
    let waited = 0; // 타겟 등장 대기(ms)
    let elapsed = 0; // 측정 시작 후 경과(ms)
    let stable = 0; // 연속으로 위치가 안 변한 프레임 수
    let scrolled = false;

    // 패널 상태는 지연 없이 즉시 — 닫기/열기 트랜지션을 곧바로 시작.
    if (step.panel) {
      window.dispatchEvent(
        new CustomEvent(SIDE_PANEL_EVENT, { detail: { open: step.panel === "open" } }),
      );
    }

    const tick = (prev: Rect | null) => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        waited += 16;
        // 패널 열림 + 렌더 대기. ~0.8s 지나도 없으면 그 단계 건너뜀.
        if (waited > 800) {
          if (index + 1 >= steps.length) finish();
          else setIndex((i) => i + 1);
          return;
        }
        raf = requestAnimationFrame(() => tick(prev));
        return;
      }
      // 화면 밖이면 한 번만 즉시 스크롤(smooth 아님 — 측정 타이밍 흔들림 방지).
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center", inline: "nearest" });
      }
      const r = el.getBoundingClientRect();
      const cur: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect(cur);
      // 위치가 4프레임 연속 그대로면 안정으로 보고 멈춤. 안 그러면 최대
      // ~0.7s 까지 추적(패널 트랜지션·스크롤 정착 흡수).
      if (
        prev &&
        Math.abs(prev.top - cur.top) < 0.5 &&
        Math.abs(prev.left - cur.left) < 0.5 &&
        Math.abs(prev.height - cur.height) < 0.5
      ) {
        stable += 1;
      } else {
        stable = 0;
      }
      elapsed += 16;
      if (stable >= 4 || elapsed > 700) return;
      raf = requestAnimationFrame(() => tick(cur));
    };

    raf = requestAnimationFrame(() => tick(null));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, step, index, steps.length, finish]);

  // 스크롤/리사이즈 동안 spotlight 가 타겟에 계속 붙어 있게 재측정.
  // capture=true 로 사이드 패널 내부 스크롤(overflow-y-auto)도 잡는다.
  useEffect(() => {
    if (!active || !step) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  // Esc 로 건너뛰기 (IME 조합 중·입력칸 안에서는 무시 — 프로젝트 패턴).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step || !rect) return null;

  const isLast = index >= steps.length - 1;

  // spotlight 구멍 박스(타겟 + 여백).
  const hole = {
    top: rect.top - HOLE_PAD,
    left: rect.left - HOLE_PAD,
    width: rect.width + HOLE_PAD * 2,
    height: rect.height + HOLE_PAD * 2,
  };

  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const tipW = Math.min(TIP_W, vw - 24);
  const targetCx = rect.left + rect.width / 2;
  const targetCy = hole.top + hole.height / 2;
  // 모바일(좁은 화면)에서는 사이드 패널이 본문을 거의 덮어 타겟 옆 말풍선이
  // 패널에 가려질 수 있다. 그래서 모바일은 말풍선을 화면 위/아래에 고정해
  // (패널 위 z-index) 항상 보이게 하고 화살표는 생략 — spotlight 링이 어디를
  // 볼지 알려준다. 타겟이 위쪽 절반이면 아래에, 아래쪽이면 위에 둬 겹침 회피.
  const isMobile = vw < 640;
  const tipLeft = isMobile
    ? Math.max(12, (vw - tipW) / 2)
    : Math.max(12, Math.min(targetCx - tipW / 2, vw - tipW - 12));
  const pinBottom = isMobile && targetCy < vh / 2;
  const placeBelow = !isMobile && hole.top + hole.height + 220 < vh;
  // 화살표 가로 위치(말풍선 기준), 양끝에서 20px 안쪽으로 클램프. 데스크톱만.
  const arrowLeft = Math.max(20, Math.min(targetCx - tipLeft, tipW - 20));

  const tipStyle: CSSProperties = isMobile
    ? pinBottom
      ? { left: tipLeft, width: tipW, bottom: "calc(16px + env(safe-area-inset-bottom))" }
      : { left: tipLeft, width: tipW, top: 16 }
    : placeBelow
      ? { left: tipLeft, width: tipW, top: hole.top + hole.height + 16 }
      : { left: tipLeft, width: tipW, bottom: vh - hole.top + 16 };

  return (
    // 전체 오버레이 — 클릭을 막아 "다음" 버튼으로만 진행하게 한다.
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="둘러보기 안내"
    >
      {/* spotlight — 박스 둘레에 거대한 그림자로 주변을 어둡게. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-lg ring-4 ring-amber-300 transition-all duration-200"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
        }}
      />

      {/* 말풍선 카드 */}
      <div
        className="absolute max-w-[calc(100vw-24px)] rounded-xl border-2 border-amber-300 bg-surface p-5 shadow-2xl"
        style={tipStyle}
      >
        {/* 화살표 — 타겟을 가리키는 삼각형(데스크톱만; 모바일은 화면 고정이라
            타겟과 떨어져 있어 화살표가 의미 없음). */}
        {!isMobile && (
          <span
            aria-hidden
            className="absolute h-4 w-4 rotate-45 border-amber-300 bg-surface"
            style={
              placeBelow
                ? { top: -9, left: arrowLeft - 8, borderTopWidth: 2, borderLeftWidth: 2 }
                : { bottom: -9, left: arrowLeft - 8, borderBottomWidth: 2, borderRightWidth: 2 }
            }
          />
        )}

        <p className="text-sm font-bold text-action">
          {index + 1} / {steps.length}
        </p>
        <h2 className="mt-1 text-xl font-bold text-ink">{step.title}</h2>
        <p className="mt-2 text-lg leading-relaxed text-ink">{step.desc}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-base font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline focus:outline-none focus-visible:underline"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) finish();
              else setIndex((i) => i + 1);
            }}
            className="inline-flex min-h-[52px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {isLast ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
