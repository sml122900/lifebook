"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { type CoachStep, SIDE_PANEL_EVENT, START_TOUR_EVENT } from "@/lib/tours";

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
  // 첫 진입 자동(서버 게이트) 또는 다른 페이지에서 넘어온 ?tour=main 이면
  // 처음부터 active. 초기값을 initializer 로 정해 effect 안 setState(경고)를 피함.
  const [active, setActive] = useState(
    () =>
      autoStart ||
      (typeof window !== "undefined" &&
        window.location.search.includes("tour=main")),
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const doneRef = useRef(false);

  const step = active ? steps[index] : undefined;

  // 투어 시작/재시작 — 항상 처음부터. 재실행이라도 완료 플래그를 리셋한다.
  const begin = useCallback(() => {
    doneRef.current = false;
    setIndex(0);
    setActive(true);
    // 열린 패널은 먼저 닫고 시작(첫 단계가 본문 버튼) — 재실행 시 패널이
    // 본문을 가린 채 시작하던 문제 차단.
    window.dispatchEvent(
      new CustomEvent(SIDE_PANEL_EVENT, { detail: { open: false } }),
    );
    // ?tour= 흔적 정리 — 새로고침에 재시작 안 되게.
    if (window.location.search.includes("tour=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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

  // 자동/쿼리로 시작된 경우(초기 active=true)의 부수효과 — 패널 닫기 + URL
  // 정리. setState 가 아니라(이벤트 dispatch·replaceState) effect 에서 OK.
  // 마운트 1회만 — 이후 시작은 begin(이벤트 콜백)이 직접 처리.
  useEffect(() => {
    if (!active) return;
    window.dispatchEvent(
      new CustomEvent(SIDE_PANEL_EVENT, { detail: { open: false } }),
    );
    if (window.location.search.includes("tour=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 같은 페이지에서 "둘러보기 다시 보기" → 이벤트로 재시작(RSC 재렌더·쿼리
  // 의존 없이 즉시). 다른 페이지는 navigate 후 위 초기값 분기가 처리.
  // setState 는 이벤트 콜백(onStart) 안에서 일어나 effect-직접-setState 가 아님.
  useEffect(() => {
    const onStart = () => begin();
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [begin]);

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
      // 위치가 연속으로 그대로면 안정으로 본다. 단, 패널을 여닫는 단계는
      // dispatch→React 커밋→CSS 트랜지션 시작 사이에 타겟이 잠깐 *제자리*로
      // 보여 일찍 멈추면 트랜지션 전(off-screen) 위치에 고정되는 버그가 있었다.
      // → 패널 단계는 최소 추적 시간(minMs)을 강제해 슬라이드가 끝난 뒤에만
      // 멈추게 한다. (Step2 오측·모바일 토큰 left:1049 둘 다 이 조기 정지 탓.)
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
      const minMs = step.panel ? 520 : 120; // 패널 트랜지션(~300ms) + 여유
      const maxMs = step.panel ? 1100 : 700;
      if ((elapsed >= minMs && stable >= 4) || elapsed > maxMs) return;
      raf = requestAnimationFrame(() => tick(cur));
    };

    raf = requestAnimationFrame(() => tick(null));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, step, index, steps.length, finish]);

  // 스크롤/리사이즈/레이아웃 변동 동안 spotlight 가 타겟에 계속 붙어 있게
  // 재측정. capture=true 로 사이드 패널 내부 스크롤(overflow-y-auto)도 잡고,
  // body ResizeObserver 로 타임라인 등 비동기 렌더로 위 콘텐츠가 밀려 타겟이
  // 이동하는 경우(측정 후 늦은 layout shift)까지 잡는다.
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
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
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
  // 타겟이 뷰포트 안에 있나 — 패널 단계에서 스크롤로도 못 들여온 안전망용.
  const onScreen =
    rect.left < vw - 8 &&
    rect.left + rect.width > 8 &&
    rect.top < vh - 8 &&
    rect.top + rect.height > 8;
  // 타겟이 화면보다 키가 크면(예: 포스터 시안 A2 세로) 타겟 위/아래에 붙이는
  // 말풍선이 화면 밖으로 밀린다 → 고정 모드로.
  const tall = rect.height > vh - 120;
  // 말풍선을 화면 위/아래에 고정하는 모드: 모바일(패널이 본문 가림)이거나
  // 타겟이 뷰포트 밖/너무 큼. 이때 화살표는 생략. spotlight 는 onScreen 이면 유지.
  const pinned = isMobile || !onScreen || tall;
  const tipLeft = pinned
    ? Math.max(12, (vw - tipW) / 2)
    : Math.max(12, Math.min(targetCx - tipW / 2, vw - tipW - 12));
  const pinBottom = pinned && (!onScreen || targetCy < vh / 2);
  const placeBelow = !pinned && hole.top + hole.height + 220 < vh;
  // 화살표 가로 위치(말풍선 기준), 양끝에서 20px 안쪽으로 클램프. 인접 모드만.
  const arrowLeft = Math.max(20, Math.min(targetCx - tipLeft, tipW - 20));

  const tipStyle: CSSProperties = pinned
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
      {/* spotlight — 타겟이 화면 안이면 박스 둘레 거대 그림자로 구멍을 뚫고,
          밖이면(안전망) 전체를 어둡게만. 위치 transition 은 빼서 측정값에
          정확히 스냅(애니메이션 중 어긋난 위치를 가리키던 문제 차단). */}
      {onScreen ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-4 ring-amber-300"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      )}

      {/* 말풍선 카드 */}
      <div
        className="absolute max-w-[calc(100vw-24px)] rounded-xl border-2 border-amber-300 bg-surface p-5 shadow-2xl"
        style={tipStyle}
      >
        {/* 화살표 — 타겟을 가리키는 삼각형(인접 모드만; 화면 고정 모드는 타겟과
            떨어져 있어 화살표가 의미 없음). */}
        {!pinned && (
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
