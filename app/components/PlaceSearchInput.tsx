"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlaceInfo } from "@/lib/place-types";

import { PlaceMap } from "./maps/PlaceMap";
import type { MapMarker } from "./maps/types";

// Phase Place — 장소 검색 입력 + 결과 카드 + 지도 타일.
//
// 화면 3단:
//   (A) 미선택 + 미편집      : "어디서 찾을지" 큰 버튼 2개 (네이버 / 구글)
//   (B) source 선택 후 편집  : 텍스트 입력 + 결과 5개 + 선택 엔진의 지도
//                              (결과 hover/클릭 → 지도 focus / 마커 클릭 → pick)
//   (C) 선택 완료            : 📍 카드 + 작은 지도 미리보기 + 버튼들
//
// onChange(PlaceInfo) 콜백 시그니처는 그대로 — 부모 폼 무수정.
//
// 시니어 친화: 큰 버튼·큰 입력·명확한 라벨, 압박 X. 지도 로딩 중에는 안내 문구.

const DEBOUNCE_MS = 500;
const MIN_QUERY_LEN = 2;

type Source = "naver" | "google";

type PlaceResult = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type ApiResponse =
  | { ok: true; source: Source; results: PlaceResult[] }
  | { ok: false; error: string; source?: string };

export function PlaceSearchInput({
  value,
  onChange,
}: {
  value: PlaceInfo;
  onChange: (next: PlaceInfo) => void;
}) {
  const hasSelected = value.placeName !== null;

  // 편집 중인 source. null = 아직 엔진 안 고름 (A 단계).
  // hasSelected 이면 C 단계 (어느 단계든 source 는 의미 없음).
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 지도 강조 인덱스 — 결과 hover/클릭으로 설정. null = 강조 X.
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  // 마지막으로 발사한 요청 id — 응답 도착 시 stale 한 결과 무시.
  const requestIdRef = useRef(0);

  // 지도 마커 — lat/lng 있는 결과만. result.idx 와 mapMarkers.idx 매핑
  // 보존을 위해 동일 순서로 필터(없는 결과는 마커 X). 마커 클릭 시 원본
  // results 의 어느 항목인지 찾기 위해 originalIdx 함께 보관.
  const mapMarkers = useMemo<(MapMarker & { originalIdx: number })[]>(() => {
    const out: (MapMarker & { originalIdx: number })[] = [];
    results.forEach((r, idx) => {
      if (r.lat !== null && r.lng !== null) {
        out.push({
          lat: r.lat,
          lng: r.lng,
          name: r.name,
          address: r.address,
          originalIdx: idx,
        });
      }
    });
    return out;
  }, [results]);

  // results 의 focusedIdx → mapMarkers 의 idx 로 매핑 (좌표 없는 결과 건너뜀).
  const mapFocusedIdx = useMemo(() => {
    if (focusedIdx === null) return null;
    const found = mapMarkers.findIndex((m) => m.originalIdx === focusedIdx);
    return found === -1 ? null : found;
  }, [focusedIdx, mapMarkers]);

  const handleMarkerClick = useCallback(
    (markerIdx: number) => {
      const orig = mapMarkers[markerIdx]?.originalIdx;
      if (orig === undefined) return;
      const r = results[orig];
      if (!r || !activeSource) return;
      onChange({
        placeName: r.name,
        placeAddress: r.address || null,
        lat: r.lat,
        lng: r.lng,
        placeSource: activeSource,
      });
      setActiveSource(null);
      setQuery("");
      setResults([]);
      setFocusedIdx(null);
      setError(null);
    },
    [mapMarkers, results, activeSource, onChange],
  );

  // debounce — query/activeSource 가 바뀔 때마다 타이머 리셋.
  // M1 — AbortController 로 이미 발사된 fetch 도 cleanup 시 끊는다.
  // requestIdRef 만으론 stale 응답을 *무시* 만 할 뿐 네트워크/외부 API quota
  // 는 그대로 소모됨. signal 로 끊으면 socket 레벨에서 정리.
  useEffect(() => {
    if (activeSource === null) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++requestIdRef.current;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/place-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, source: activeSource }),
          signal: ctrl.signal,
        });
        const data: ApiResponse = await res.json();
        // 도착이 늦은 응답 → 무시 (사용자가 다른 입력 중).
        if (id !== requestIdRef.current) return;
        setFocusedIdx(null); // 새 검색 결과 → 강조 초기화
        if (!data.ok) {
          setError(data.error || "장소를 찾지 못했어요.");
          setResults([]);
        } else {
          setResults(data.results);
        }
      } catch (e) {
        // cleanup 으로 인한 취소는 정상 — 에러 메시지 띄우지 않음.
        if (e instanceof Error && e.name === "AbortError") return;
        if (id !== requestIdRef.current) return;
        setError("장소를 찾지 못했어요. 다른 이름으로 검색해보세요.");
        setResults([]);
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, activeSource]);

  function pick(r: PlaceResult, source: Source) {
    onChange({
      placeName: r.name,
      placeAddress: r.address || null,
      lat: r.lat,
      lng: r.lng,
      placeSource: source,
    });
    setActiveSource(null);
    setQuery("");
    setResults([]);
    setFocusedIdx(null);
    setError(null);
  }

  function clearAll() {
    onChange({
      placeName: null,
      placeAddress: null,
      lat: null,
      lng: null,
      placeSource: null,
    });
    setActiveSource(null);
    setQuery("");
    setResults([]);
    setFocusedIdx(null);
    setError(null);
  }

  function startEditing() {
    // 기존 선택값이 있으면 같은 source 로 시작 → 자연스러운 흐름.
    if (value.placeSource === "naver" || value.placeSource === "google") {
      setActiveSource(value.placeSource);
    } else {
      setActiveSource(null);
    }
    // M7 — 기존 장소명을 검색창에 prefill. 사용자가 작은 수정만으로 다시
    // 검색 가능. debounce 가 떨어지면 자동으로 결과가 다시 뜸.
    setQuery(value.placeName ?? "");
    setResults([]);
    setFocusedIdx(null);
    setError(null);
  }

  // ── (C) 선택 완료 ────────────────────────────────────────────
  if (hasSelected && activeSource === null) {
    const sourceLabel =
      value.placeSource === "naver"
        ? "네이버"
        : value.placeSource === "google"
          ? "구글"
          : "지도";
    // 좌표 있고 source 가 둘 중 하나면 미리보기 지도.
    const hasCoords =
      value.lat !== null &&
      value.lng !== null &&
      (value.placeSource === "naver" || value.placeSource === "google");
    const previewMarkers: MapMarker[] = hasCoords
      ? [
          {
            lat: value.lat as number,
            lng: value.lng as number,
            name: value.placeName ?? "",
            address: value.placeAddress ?? "",
          },
        ]
      : [];
    return (
      <div className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-base text-amber-900">
              <span aria-hidden>📍 </span>
              <b>{value.placeName}</b>
              <span className="ml-1 text-sm text-amber-700">
                · {sourceLabel}
              </span>
            </p>
            {value.placeAddress && value.placeAddress !== value.placeName && (
              <p className="mt-0.5 text-sm text-zinc-700">
                {value.placeAddress}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
            >
              다른 곳으로 바꾸기
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
            >
              지우기
            </button>
          </div>
        </div>
        {hasCoords && (
          <PlaceMap
            source={value.placeSource as Source}
            markers={previewMarkers}
            focusedIdx={0}
            className="h-[150px]"
          />
        )}
      </div>
    );
  }

  // ── (A) 엔진 미선택 ─────────────────────────────────────────
  if (activeSource === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base text-zinc-700">어디서 찾을지 골라보세요.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SourcePickButton
            label="🗺️ 네이버 지도에서 찾기"
            onClick={() => setActiveSource("naver")}
          />
          <SourcePickButton
            label="🌍 구글 지도에서 찾기"
            onClick={() => setActiveSource("google")}
          />
        </div>
        <p className="text-sm text-zinc-600">
          한국 장소는 네이버, 해외 장소는 구글에서 찾아보세요.
        </p>
      </div>
    );
  }

  // ── (B) 엔진 선택 후 편집 ───────────────────────────────────
  const sourceLabel = activeSource === "naver" ? "네이버" : "구글";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-zinc-700">
          <b>{sourceLabel} 지도</b>에서 검색 중이에요.
        </p>
        <button
          type="button"
          onClick={() => {
            setActiveSource(null);
            setQuery("");
            setResults([]);
            setError(null);
          }}
          className="inline-flex min-h-[40px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
        >
          엔진 바꾸기
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          activeSource === "naver"
            ? "🔍 장소 검색… (예: 강원도 춘천, 코엑스)"
            : "🔍 장소 검색… (예: 도쿄역, Eiffel Tower)"
        }
        maxLength={100}
        autoFocus
        className="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
      />

      {loading && <p className="text-sm text-zinc-600">검색 중…</p>}

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {error}
        </p>
      )}

      {!loading && !error && results.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="장소 검색 결과">
          {results.map((r, i) => {
            const focused = focusedIdx === i;
            const hasCoord = r.lat !== null && r.lng !== null;
            return (
              <li key={`${r.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => pick(r, activeSource)}
                  onMouseEnter={() => hasCoord && setFocusedIdx(i)}
                  onFocus={() => hasCoord && setFocusedIdx(i)}
                  className={
                    "flex w-full min-h-[48px] items-start gap-3 rounded-md border-2 px-4 py-2 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 " +
                    (focused
                      ? "border-amber-500 bg-amber-100"
                      : "border-zinc-200 bg-white hover:border-amber-400 hover:bg-amber-50")
                  }
                >
                  <span
                    aria-hidden
                    className={
                      "mt-1 " + (focused ? "text-amber-700" : "text-zinc-500")
                    }
                  >
                    {focused ? "●" : "○"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-zinc-900">
                      {r.name}
                    </span>
                    {r.address && r.address !== r.name && (
                      <span className="block text-sm text-zinc-600">
                        {r.address}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && query.trim().length >= MIN_QUERY_LEN &&
        results.length === 0 && (
          <p className="text-sm text-zinc-600">
            결과가 없어요. 다른 이름으로 검색해보세요.
          </p>
        )}

      {/* B 단계 지도 — 결과 hover/클릭 → focusedIdx 강조, 마커 클릭 → pick. */}
      <PlaceMap
        source={activeSource}
        markers={mapMarkers}
        focusedIdx={mapFocusedIdx}
        className="h-[200px] sm:h-[300px]"
        onMarkerClick={handleMarkerClick}
      />

      <button
        type="button"
        onClick={clearAll}
        className="self-start inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500"
      >
        선택 안 함 (장소 모름)
      </button>

      <p className="text-xs text-zinc-500">
        장소는 안 골라도 돼요. 떠오르는 만큼만.
      </p>
    </div>
  );
}

function SourcePickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-5 py-3 text-lg font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      {label}
    </button>
  );
}
