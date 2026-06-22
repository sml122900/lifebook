"use client";

// 장소 draft 카드 — PlaceSearchInput 인라인 + 좌표 저장 승인.
//
// JS 없이 작동하는 폴백: "좌표 없이 추가" = form action (approveDraftPersonAction).
// JS 있을 때 확장: "📍 지도에서 찾기" 펼치면 PlaceSearchInput → 좌표 저장 후 승인.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import { EMPTY_PLACE } from "@/lib/place-types";
import type { PlaceInfo } from "@/lib/place-types";

import { approveDraftPersonAction, rejectDraftPersonAction, approveLocationWithPlaceAction } from "./draft-actions";

export function DraftLocationCard({
  personId,
  name,
  memo,
}: {
  personId: string;
  name: string;
  memo: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [place, setPlace] = useState<PlaceInfo>(EMPTY_PLACE);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasCoords = place.lat !== null && place.lng !== null;

  function onApproveWithPlace() {
    if (!hasCoords) return;
    setError(null);
    startTransition(async () => {
      try {
        await approveLocationWithPlaceAction(personId, {
          lat: place.lat!,
          lng: place.lng!,
          placeAddress: place.placeAddress,
          placeSource: place.placeSource ?? "naver",
        });
        router.refresh();
      } catch (e) {
        setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        console.error("[draft-location-approve]", e);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white px-4 py-3">
      {/* 장소 정보 */}
      <div>
        <p className="font-semibold text-ink">📍 {name}</p>
        {memo && <p className="mt-0.5 text-sm text-ink-soft">{memo}</p>}
      </div>

      {/* 지도 검색 토글 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="self-start text-sm font-semibold text-amber-700 underline-offset-2 hover:underline focus:outline-none"
      >
        {expanded ? "▲ 지도 검색 닫기" : "▼ 지도에서 위치 찾기 (선택)"}
      </button>

      {expanded && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
          <PlaceSearchInput value={place} onChange={setPlace} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-700">{error}</p>
      )}

      {/* 승인/거절 버튼 */}
      <div className="flex flex-wrap gap-2">
        {/* JS 있을 때: 지도 위치 포함 승인 */}
        {hasCoords && (
          <button
            type="button"
            onClick={onApproveWithPlace}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-600 bg-emerald-100 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "저장 중…" : "✓ 지도 위치 저장 후 추가"}
          </button>
        )}
        {/* 폴백: 좌표 없이 승인 (form action, JS 불필요) */}
        <form action={approveDraftPersonAction.bind(null, personId)}>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✓ {hasCoords ? "좌표 없이 추가" : "추가"}
          </button>
        </form>
        {/* 거절 */}
        <form action={rejectDraftPersonAction.bind(null, personId)}>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink-soft hover:bg-banner disabled:cursor-not-allowed disabled:opacity-50"
          >
            건너뛰기
          </button>
        </form>
      </div>
    </div>
  );
}
