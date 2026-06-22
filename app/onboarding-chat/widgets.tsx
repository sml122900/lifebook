"use client";

import { useState } from "react";

// ─── 연도 피커 ────────────────────────────────────────────────
export function YearWidget({
  onSubmit,
  disabled,
}: {
  onSubmit: (year: number) => void;
  disabled: boolean;
}) {
  const [raw, setRaw] = useState("");
  const year = parseInt(raw, 10);
  const MAX_YEAR = new Date().getFullYear();
  const valid = !isNaN(year) && year >= 1900 && year <= MAX_YEAR;

  return (
    <div className="flex gap-2">
      <input
        type="number"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid && !disabled) onSubmit(year);
        }}
        placeholder="예: 1955"
        min={1900}
        max={MAX_YEAR}
        disabled={disabled}
        className="w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-[22px] font-medium text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => valid && onSubmit(year)}
        disabled={!valid || disabled}
        className="min-h-[56px] rounded-xl bg-[var(--color-action)] px-6 text-[17px] font-medium text-white disabled:opacity-40"
      >
        확인
      </button>
    </div>
  );
}

// ─── 관심 분야 칩 다중선택 ─────────────────────────────────────
export const INTEREST_OPTIONS = [
  "영화",
  "드라마/예능",
  "음악",
  "게임",
  "스포츠",
  "시사/뉴스",
  "기술/IT",
] as const;

export function ChipsWidget({
  onSubmit,
  disabled,
}: {
  onSubmit: (selected: string[]) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(opt: string) {
    setSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            disabled={disabled}
            className={[
              "min-h-[56px] rounded-full border px-4 py-2 text-[17px] font-medium transition-colors",
              selected.includes(opt)
                ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                : "border-[var(--color-line)] bg-white text-[var(--color-ink)] hover:border-[var(--color-brand)]/40",
            ].join(" ")}
          >
            {opt}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSubmit(selected)}
        disabled={selected.length === 0 || disabled}
        className="w-full min-h-[56px] rounded-xl bg-[var(--color-action)] py-3 text-[17px] font-medium text-white disabled:opacity-40"
      >
        선택 완료{selected.length > 0 ? ` (${selected.length})` : ""}
      </button>
    </div>
  );
}

// ─── 항목 추가형 리스트 (residences·schools·favMovies·favGames·favMusic) ─
export function MultiItemWidget({
  placeholder,
  onSubmit,
  disabled,
}: {
  placeholder: string;
  onSubmit: (items: string[]) => void;
  disabled: boolean;
}) {
  const [inputVal, setInputVal] = useState("");
  const [items, setItems] = useState<string[]>([]);

  function add() {
    const t = inputVal.trim();
    if (!t || items.includes(t)) return;
    setItems((prev) => [...prev, t]);
    setInputVal("");
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[15px] text-amber-800"
            >
              {item}
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((i) => i !== item))}
                disabled={disabled}
                aria-label={`${item} 제거`}
                className="leading-none text-amber-500 hover:text-amber-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-[17px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={!inputVal.trim() || disabled}
          className="min-h-[56px] rounded-xl border border-[var(--color-brand)] px-4 text-[17px] font-medium text-[var(--color-brand)] disabled:opacity-40"
        >
          추가
        </button>
      </div>
      <button
        type="button"
        onClick={() => onSubmit(items)}
        disabled={items.length === 0 || disabled}
        className="w-full min-h-[56px] rounded-xl bg-[var(--color-action)] py-3 text-[17px] font-medium text-white disabled:opacity-40"
      >
        완료 ({items.length}개)
      </button>
    </div>
  );
}
