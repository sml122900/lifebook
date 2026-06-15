"use client";

import { useEffect, useRef, useState } from "react";

// T3-a/b + 텍스트 개인화 — 사건 빼고/넣기(체크) + 크기 S/M/L(잎/꽃/열매) +
// 제목·푸터·뿌리 글자 편집. 전부 DOM 주입(재렌더·재매핑·서버 왕복 0).
//
// 포스터 SVG 가 가진 요소만 손댄다(신규 요소·자유 배치·드래그 X):
//   - 끄기/켜기: 바깥 #slot-cN-eM + 라벨 #label-cN-eM·-t
//   - 크기 스왑: 안쪽 #slot-cN-eM-leaf/-flower/-fruit (렌더러가 미리 emit)
//   - 글자 편집: #title-name(제목) · #footer-credit(푸터) · #root-text(뿌리)
//
// off·size·text 를 한 useEffect 에서 함께 적용 → 충돌 0·idempotent. effect 는
// 커밋 후 실행이라 svg DOM 존재 보장, 재적용돼도 상태와 항상 일치.
//
// 클라 state 만(저장 X·마이그 0). T1~T3b 엔진(lib/poster/*) 무수정 — 추가 레이어.

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

const SIZE_VARIANT: Record<Size, string> = { S: "leaf", M: "flower", L: "fruit" };

const SIZE_OPTIONS: { size: Size; label: string; sub: string }[] = [
  { size: "S", label: "작게", sub: "잎" },
  { size: "M", label: "보통", sub: "꽃" },
  { size: "L", label: "크게", sub: "열매" },
];

// 글자 길이 상한 — SVG 텍스트는 줄바꿈이 안 돼 넘치면 나무를 침범. 제목은
// 폰트가 커(19px) 더 짧게, 푸터·뿌리는 작아 여유.
const MAX = { title: 16, footer: 30, root: 30 };

export function PosterInteractive({
  svg,
  slots,
  defaultTitle,
  defaultFooter,
  defaultRoot,
}: {
  svg: string;
  slots: PosterSlot[];
  defaultTitle: string;
  defaultFooter: string;
  defaultRoot: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [sizes, setSizes] = useState<Map<string, Size>>(() => {
    const m = new Map<string, Size>();
    for (const s of slots) {
      if (s.sizeable && s.initialSize) m.set(keyOf(s), s.initialSize);
    }
    return m;
  });
  // 글자 편집 — 빈칸이면 기본값(자동) 유지.
  const [title, setTitle] = useState("");
  const [footer, setFooter] = useState("");
  const [rootText, setRootText] = useState("");

  // off + size + text 를 svg DOM 에 함께 적용 (마운트 시 1회 포함).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const setDisp = (id: string, val: string) => {
      const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (el) el.style.display = val;
    };

    // ── 사건 끄기/켜기 + 크기 ──
    for (const s of slots) {
      const key = keyOf(s);
      const hidden = off.has(key);
      const slotId = `slot-c${s.c}-e${s.e}`;
      setDisp(slotId, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}`, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}-t`, hidden ? "none" : "");
      if (s.sizeable) {
        const active = SIZE_VARIANT[sizes.get(key) ?? s.initialSize ?? "S"];
        for (const v of ["leaf", "flower", "fruit"]) {
          setDisp(`${slotId}-${v}`, !hidden && v === active ? "" : "none");
        }
      }
    }

    // ── 글자 편집 (단일 <text>) ──
    const applyText = (id: string, value: string, optional: boolean) => {
      const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (!el) return;
      if (value) {
        el.textContent = value;
        el.style.display = "";
      } else if (optional) {
        el.style.display = "none";
      }
    };
    applyText("title-name", title.trim() || defaultTitle, false);
    applyText("footer-credit", footer.trim() || defaultFooter, true);

    // ── 뿌리(root-text = <g> + 텍스트 줄들) ──
    const rootG = root.querySelector<SVGElement>("#root-text");
    if (rootG) {
      const val = rootText.trim() || defaultRoot;
      const lines = rootG.querySelectorAll("text");
      if (val) {
        rootG.style.display = "";
        if (lines[0]) lines[0].textContent = val;
        // 이후 줄(템플릿 예시 부모 이름)은 비워 가짜 데이터 노출 방지.
        for (let i = 1; i < lines.length; i++) lines[i].textContent = "";
      } else {
        rootG.style.display = "none";
      }
    }
  }, [
    off,
    sizes,
    title,
    footer,
    rootText,
    slots,
    defaultTitle,
    defaultFooter,
    defaultRoot,
  ]);

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

      {/* 컨트롤 — 글자 편집 + 사건 리스트 */}
      <div className="mx-auto mt-6 w-full max-w-[560px] space-y-6 lg:mt-0 lg:w-96 lg:shrink-0">
        {/* 글자 바꾸기 */}
        <section>
          <h3 className="text-lg font-bold text-ink">글자 바꾸기</h3>
          <p className="mt-1 text-base text-ink-soft">
            비워두면 자동으로 채워져요.
          </p>
          <div className="mt-3 space-y-4">
            <TextField
              label="포스터 제목"
              value={title}
              onChange={setTitle}
              placeholder={defaultTitle}
              max={MAX.title}
            />
            <TextField
              label="헌사 · 날짜"
              value={footer}
              onChange={setFooter}
              placeholder={defaultFooter || "예: 사랑하는 가족에게 · 2026 봄"}
              max={MAX.footer}
            />
            <TextField
              label="출생 · 부모"
              value={rootText}
              onChange={setRootText}
              placeholder={defaultRoot || "예: 충북 청주 · 1942"}
              max={MAX.root}
            />
          </div>
        </section>

        {/* 사건 고르기 */}
        <fieldset>
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
                            <span className="text-base font-bold">
                              {opt.label}
                            </span>
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
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
}) {
  return (
    <label className="block">
      <span className="text-base font-bold text-ink">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-2 border-line bg-surface px-3 py-3 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
      />
      <span className="mt-1 block text-right text-sm text-ink-soft">
        {value.length}/{max}
      </span>
    </label>
  );
}
