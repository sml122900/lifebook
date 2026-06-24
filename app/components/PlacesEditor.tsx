"use client";

// 장소 1:N 입력 — 여러 장소를 추가/제거. 한 개 추가 흐름은 기존 단일 위젯
// PlaceSearchInput 을 그대로 재사용한다(엔진 선택 → 검색 → 선택). 선택이
// 끝나면(onChange 에 placeName 채워져 옴) 배열에 더하고 추가창을 닫는다.
//
// PlaceSearchInput 의 onChange 는 "최종 선택" 또는 "선택 안 함(clearAll)"
// 에만 발사된다(타이핑 중에는 X) → 한 번 고를 때 한 번만 append.
//
// 시니어 친화: "장소 추가" 큰 버튼, 고른 장소는 카드로 또렷이, 각 카드에 큰
// [제거] 버튼. 압박 X("안 골라도 돼요").

import { useState } from "react";

import { MapPin, Plus, X } from "lucide-react";

import { PlaceSearchInput } from "./PlaceSearchInput";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";

export function PlacesEditor({
  value,
  onChange,
  addLabel = "장소 추가",
}: {
  value: PlaceInfo[];
  onChange: (next: PlaceInfo[]) => void;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);

  // PlaceSearchInput 에서 한 곳을 고르면(placeName 있음) 배열에 더하고 닫는다.
  // "선택 안 함"(placeName=null)으로 와도 추가창을 닫는다(취소와 동일).
  function handleDraftChange(p: PlaceInfo) {
    if (p.placeName) onChange([...value, p]);
    setAdding(false);
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 이미 고른 장소들 */}
      {value.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="고른 장소 목록">
          {value.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-base text-amber-900">
                <MapPin
                  strokeWidth={1.75}
                  aria-hidden
                  className="h-4 w-4 shrink-0"
                />
                <b className="truncate">{p.placeName}</b>
                {p.placeSource && (
                  <span className="shrink-0 text-sm text-amber-700">
                    ·{" "}
                    {p.placeSource === "naver"
                      ? "네이버"
                      : p.placeSource === "google"
                        ? "구글"
                        : "지도"}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`${p.placeName} 제거`}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border-2 border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              >
                <X strokeWidth={2} aria-hidden className="h-4 w-4" />
                제거
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 추가창(열렸을 때) — 단일 위젯 재사용. 취소로 닫기. */}
      {adding ? (
        <div className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-3">
          <PlaceSearchInput value={EMPTY_PLACE} onChange={handleDraftChange} />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="self-start inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            추가 취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-[56px] items-center justify-center gap-2 self-start rounded-md border-2 border-amber-400 bg-amber-50 px-5 py-3 text-lg font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
        >
          <Plus strokeWidth={2} aria-hidden className="h-5 w-5" />
          {value.length === 0 ? addLabel : "장소 더 추가"}
        </button>
      )}
    </div>
  );
}
