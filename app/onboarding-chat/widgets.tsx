"use client";

import { useState } from "react";
import type { PlaceInfo } from "@/lib/place-types";
import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";

const EMPTY_PLACE: PlaceInfo = {
  placeName: null,
  placeAddress: null,
  lat: null,
  lng: null,
  placeSource: null,
};

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

// ─── 장소 매핑 포함 항목 리스트 (residences·schools) ────────────
// MultiItemWidget 과 동일 UX + 항목마다 "📍 지도에서 찾기" 토글.
// PlaceSearchInput(기존 3단 flow) 재사용.
// onSubmit(names, places, qKey) — places 는 PlaceInfo 배열(위치 미선택 = EMPTY_PLACE).

type PlaceItem = { name: string; place: PlaceInfo };

export function PlaceableMultiItemWidget({
  placeholder,
  qKey,
  onSubmit,
  disabled,
}: {
  placeholder: string;
  qKey: string;
  onSubmit: (names: string[], places: PlaceInfo[], key: string) => void;
  disabled: boolean;
}) {
  const [inputVal, setInputVal] = useState("");
  const [items, setItems] = useState<PlaceItem[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  function add() {
    const t = inputVal.trim();
    if (!t || items.some((i) => i.name === t)) return;
    // placeName 에 item 이름 넣어두면 PlaceSearchInput step B 검색창 prefill 됨
    setItems((prev) => [...prev, { name: t, place: { ...EMPTY_PLACE, placeName: t } }]);
    setInputVal("");
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
  }

  function handlePlaceChange(idx: number, p: PlaceInfo) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, place: p } : item)));
    if (p.lat !== null) setExpandedIdx(null); // 좌표 선택하면 자동 닫기
  }

  const isPinned = (item: PlaceItem) => item.place.lat !== null;

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="space-y-1">
              {/* 칩 + 지도 버튼 */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "flex items-center gap-1 rounded-full px-3 py-1 text-[15px]",
                    isPinned(item) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
                  ].join(" ")}
                >
                  {isPinned(item) && <span aria-hidden>📍</span>}
                  {item.name}
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={disabled}
                    aria-label={`${item.name} 제거`}
                    className="leading-none opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  disabled={disabled}
                  className={[
                    "text-[13px]",
                    isPinned(item) ? "text-emerald-700" : "text-[var(--color-ink-subtle)]",
                    "hover:text-[var(--color-ink)]",
                  ].join(" ")}
                >
                  {expandedIdx === idx
                    ? "닫기 ▲"
                    : isPinned(item)
                    ? "📍 바꾸기"
                    : "📍 지도에서 찾기"}
                </button>
              </div>

              {/* PlaceSearchInput 인라인 (DraftLocationCard 패턴 재사용) */}
              {expandedIdx === idx && (
                <div className="rounded-xl border border-[var(--color-line)] bg-white p-3">
                  <PlaceSearchInput
                    value={item.place}
                    onChange={(p: PlaceInfo) => handlePlaceChange(idx, p)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 텍스트 입력 + 추가 */}
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
        onClick={() =>
          onSubmit(items.map((i) => i.name), items.map((i) => i.place), qKey)
        }
        disabled={items.length === 0 || disabled}
        className="w-full min-h-[56px] rounded-xl bg-[var(--color-action)] py-3 text-[17px] font-medium text-white disabled:opacity-40"
      >
        완료 ({items.length}개)
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
