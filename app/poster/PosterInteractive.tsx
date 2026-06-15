"use client";

import { useCallback, useRef, useState } from "react";

// T3-a — 사건 빼고/넣기 (체크박스 → 포스터 슬롯 토글).
//
// 재렌더·재매핑·서버 왕복 0. 포스터 SVG 는 이미 사건마다 slot-cN-eM(비주얼)·
// label-cN-eM(날짜)·label-cN-eM-t(제목) 그룹을 갖고 있으니, 체크를 끄면 그
// (c,e) 3그룹에 display:none, 켜면 해제만 한다. 클릭 즉시 사라짐/나타남.
//
// 클라 state 만(저장 X·마이그 0). 주문 연동은 후순위(T3-b).
// T1 엔진(lib/poster/*) 무수정 — 기존 슬롯 ID 만 토글하는 인터랙션 레이어.

export type PosterSlot = {
  c: number;
  e: number;
  title: string;
  yearLabel: string;
};

export function PosterInteractive({
  svg,
  slots,
}: {
  svg: string;
  slots: PosterSlot[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // "꺼진" 슬롯 키 집합. 초기엔 전부 ON(빈 집합).
  const [off, setOff] = useState<Set<string>>(new Set());

  const keyOf = (s: PosterSlot) => `${s.c}-${s.e}`;

  const applyVisibility = useCallback(
    (c: number, e: number, visible: boolean) => {
      const root = containerRef.current;
      if (!root) return;
      const ids = [`slot-c${c}-e${e}`, `label-c${c}-e${e}`, `label-c${c}-e${e}-t`];
      for (const id of ids) {
        const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
        if (el) el.style.display = visible ? "" : "none";
      }
    },
    [],
  );

  const toggle = useCallback(
    (s: PosterSlot) => {
      const key = keyOf(s);
      setOff((prev) => {
        const wasOff = prev.has(key);
        applyVisibility(s.c, s.e, wasOff); // 꺼져 있었으면 → 보이게
        const next = new Set(prev);
        if (wasOff) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [applyVisibility],
  );

  return (
    <div className="mx-auto lg:flex lg:items-start lg:gap-8">
      {/* 포스터 — 읽기 전용 인라인 SVG (엔진이 width=100% 로 유동화). */}
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm lg:mx-0 lg:flex-1">
        <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      {/* 사건 체크박스 리스트 */}
      <fieldset className="mx-auto mt-6 w-full max-w-[560px] lg:mt-0 lg:w-80 lg:shrink-0">
        <legend className="text-lg font-bold text-ink">
          포스터에 넣을 이야기 고르기
        </legend>
        <p className="mt-1 text-base text-ink-soft">
          체크를 끄면 나무에서 빠지고, 켜면 다시 나타나요.
        </p>

        <ul className="mt-4 divide-y divide-line rounded-md border-2 border-line">
          {slots.map((s) => {
            const on = !off.has(keyOf(s));
            return (
              <li key={keyOf(s)}>
                <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(s)}
                    className="h-6 w-6 shrink-0 accent-[#C8923D]"
                  />
                  <span
                    className={
                      "text-lg " +
                      (on ? "text-ink" : "text-ink-soft line-through")
                    }
                  >
                    {s.title}
                  </span>
                  <span className="ml-auto shrink-0 text-base text-ink-soft">
                    {s.yearLabel}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}
