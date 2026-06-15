"use client";

import { useEffect, useRef, useState } from "react";

// T3-a/b — 사건 빼고/넣기(체크박스) + 크기 S/M/L(잎/꽃/열매 스왑).
//
// 재렌더·재매핑·서버 왕복 0. 포스터 SVG 는 슬롯마다
//   - 켜기/끄기용: 바깥 #slot-cN-eM + 라벨 #label-cN-eM·-t
//   - 크기 스왑용: 안쪽 #slot-cN-eM-leaf / -flower / -fruit (렌더러가 미리 emit)
// 을 갖는다. 끄기 = 바깥 슬롯+라벨 none. 크기 = active 변형만 inline.
//
// off(끄기)와 size(S/M/L)를 한 useEffect 로 함께 적용 → 충돌 0·idempotent.
// effect 는 커밋 후 실행이라 svg DOM 존재 보장, 재적용돼도 상태와 항상 일치.
//
// 클라 state 만(저장 X·마이그 0). bird(standout)는 S/M/L 대상 아님(sizeable=false).

export type Size = "S" | "M" | "L";

export type PosterSlot = {
  c: number;
  e: number;
  title: string;
  yearLabel: string;
  sizeable: boolean;
  initialSize: Size | null;
};

const keyOf = (s: PosterSlot) => `${s.c}-${s.e}`;

// 크기 → 변형 ID 접미사 (작게=잎 / 보통=꽃 / 크게=열매).
const SIZE_VARIANT: Record<Size, string> = {
  S: "leaf",
  M: "flower",
  L: "fruit",
};

const SIZE_OPTIONS: { size: Size; label: string; sub: string }[] = [
  { size: "S", label: "작게", sub: "잎" },
  { size: "M", label: "보통", sub: "꽃" },
  { size: "L", label: "크게", sub: "열매" },
];

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
  // 슬롯별 크기. 초기 = T1 휴리스틱 결과(initialSize).
  const [sizes, setSizes] = useState<Map<string, Size>>(() => {
    const m = new Map<string, Size>();
    for (const s of slots) {
      if (s.sizeable && s.initialSize) m.set(keyOf(s), s.initialSize);
    }
    return m;
  });

  // off + size 를 svg DOM 에 함께 적용 (마운트 시 1회 포함).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const setDisp = (id: string, val: string) => {
      const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (el) el.style.display = val;
    };
    for (const s of slots) {
      const key = keyOf(s);
      const hidden = off.has(key);
      const slotId = `slot-c${s.c}-e${s.e}`;
      // 바깥 슬롯 + 라벨 (끄기/켜기)
      setDisp(slotId, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}`, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}-t`, hidden ? "none" : "");
      // 안쪽 변형 (크기 스왑) — sizeable 슬롯만. active 만 보임.
      if (s.sizeable) {
        const active = SIZE_VARIANT[sizes.get(key) ?? s.initialSize ?? "S"];
        for (const v of ["leaf", "flower", "fruit"]) {
          setDisp(`${slotId}-${v}`, !hidden && v === active ? "" : "none");
        }
      }
    }
  }, [off, sizes, slots]);

  const toggle = (s: PosterSlot) => {
    const key = keyOf(s);
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setSize = (s: PosterSlot, size: Size) => {
    setSizes((prev) => new Map(prev).set(keyOf(s), size));
  };

  return (
    <div className="mx-auto lg:flex lg:items-start lg:gap-8">
      {/* 포스터 — 읽기 전용 인라인 SVG (엔진이 width=100% 로 유동화). */}
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm lg:mx-0 lg:flex-1">
        <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      {/* 사건 컨트롤 리스트 */}
      <fieldset className="mx-auto mt-6 w-full max-w-[560px] lg:mt-0 lg:w-96 lg:shrink-0">
        <legend className="text-lg font-bold text-ink">이야기 고르기</legend>
        <p className="mt-1 text-base text-ink-soft">
          체크로 넣고 빼고, 크기로 잎·꽃·열매를 바꿔보세요.
        </p>

        <ul className="mt-4 divide-y divide-line rounded-md border-2 border-line">
          {slots.map((s) => {
            const key = keyOf(s);
            const on = !off.has(key);
            const size = sizes.get(key) ?? s.initialSize;
            return (
              <li key={key} className="px-4 py-3">
                <label
                  className={
                    "flex min-h-[44px] cursor-pointer items-center gap-3 transition-opacity " +
                    (on ? "opacity-100" : "opacity-40")
                  }
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(s)}
                    className="h-6 w-6 shrink-0 accent-[#C8923D]"
                  />
                  <span
                    className={"text-lg text-ink " + (on ? "" : "line-through")}
                  >
                    {s.title}
                  </span>
                  <span
                    className={
                      "ml-auto shrink-0 text-base text-ink-soft " +
                      (on ? "" : "line-through")
                    }
                  >
                    {s.yearLabel}
                  </span>
                </label>

                {s.sizeable ? (
                  <div
                    role="group"
                    aria-label="크기 고르기"
                    className={
                      "mt-2 flex gap-2 " +
                      (on ? "" : "pointer-events-none opacity-40")
                    }
                  >
                    {SIZE_OPTIONS.map((opt) => {
                      const active = size === opt.size;
                      return (
                        <button
                          key={opt.size}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSize(s, opt.size)}
                          className={
                            "flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-md border-2 leading-tight transition-colors " +
                            (active
                              ? "border-brand bg-banner text-ink"
                              : "border-line text-ink-soft hover:bg-banner")
                          }
                        >
                          <span className="text-base font-bold">{opt.label}</span>
                          <span className="text-sm">{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-base text-ink-soft">
                    🐦 특별한 인연 — 새로 그려져요
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}
