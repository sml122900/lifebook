"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapPin } from "lucide-react";

import type { PlaceInfo } from "@/lib/place-types";

import type { MapMarker } from "./maps/types";

// 지도 SDK(@googlemaps/js-api-loader)는 모듈 최상단에서 window 를 참조해
// 서버 렌더(SSR) 시 평가되면 "window is not defined" 로 터진다. 지도는 순수
// 인터랙션 요소(SEO 가치 X)이므로 ssr:false 로 서버 평가에서 제외한다.
const PlaceMap = dynamic(
  () => import("./maps/PlaceMap").then((m) => m.PlaceMap),
  { ssr: false },
);

// Phase Place — 장소 검색 입력 + 결과 카드 + 지도 타일.
//
// 화면 3단:
//   (A) 미선택 + 미편집      : "어디서 찾을지" 큰 버튼 2개 (네이버 / 구글)
//   (B) source 선택 후 편집  : 텍스트 입력 + 결과 목록 + 지도(네이버만)
//                              구글 = autocomplete 후보 드롭다운 → 선택 → 상세 조회 → (C)
//                              네이버 = 기존 Text Search 결과 5개 + 지도 마커
//   (C) 선택 완료            : 📍 카드 + 작은 지도 미리보기 + 버튼들
//
// onChange(PlaceInfo) 콜백 시그니처는 그대로 — 부모 폼 무수정.
//
// 시니어 친화: 큰 버튼·큰 입력·명확한 라벨, 압박 X. 지도 로딩 중에는 안내 문구.

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

type Source = "naver" | "google";

type PlaceResult = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type Suggestion = {
  text: string;
  placeId: string;
};

type ApiSearchResponse =
  | { ok: true; source: Source; results: PlaceResult[] }
  | { ok: false; error: string; source?: string };

type ApiAutocompleteResponse =
  | { ok: true; action: "autocomplete"; suggestions: Suggestion[] }
  | { ok: false; error: string };

type ApiDetailResponse =
  | { ok: true; action: "detail"; result: PlaceResult }
  | { ok: false; error: string };

export function PlaceSearchInput({
  value,
  onChange,
}: {
  value: PlaceInfo;
  onChange: (next: PlaceInfo) => void;
}) {
  const hasSelected = value.placeName !== null;

  // 편집 중인 source. null = 아직 엔진 안 고름 (A 단계).
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  // 네이버: Text Search 결과 5개 (좌표 포함)
  const [results, setResults] = useState<PlaceResult[]>([]);
  // 구글: Autocomplete 후보 목록 (좌표 없음, placeId 로 상세 조회)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 지도 강조 인덱스 — 네이버 결과 hover/클릭으로 설정. null = 강조 X.
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  // 마지막으로 발사한 요청 id — 응답 도착 시 stale 한 결과 무시.
  const requestIdRef = useRef(0);

  // 지도 마커 — 네이버 results 에서만. lat/lng 있는 결과만. originalIdx 함께.
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
      setSuggestions([]);
      setFocusedIdx(null);
      setError(null);
    },
    [mapMarkers, results, activeSource, onChange],
  );

  // debounce — query/activeSource 가 바뀔 때마다 타이머 리셋.
  // 구글: autocomplete 엔드포인트 → suggestions 세팅.
  // 네이버: 기존 text search → results 세팅.
  useEffect(() => {
    if (activeSource === null) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setSuggestions([]);
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
        const isGoogle = activeSource === "google";
        const body = isGoogle
          ? JSON.stringify({ action: "autocomplete", query: trimmed })
          : JSON.stringify({ query: trimmed, source: activeSource });

        const res = await fetch("/api/place-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: ctrl.signal,
        });
        if (id !== requestIdRef.current) return;
        setFocusedIdx(null);

        if (isGoogle) {
          const data: ApiAutocompleteResponse = await res.json();
          if (!data.ok) {
            setError(data.error || "장소를 찾지 못했어요.");
            setSuggestions([]);
          } else {
            setSuggestions(data.suggestions);
          }
          setResults([]);
        } else {
          const data: ApiSearchResponse = await res.json();
          if (!data.ok) {
            setError(data.error || "장소를 찾지 못했어요.");
            setResults([]);
          } else {
            setResults(data.results);
          }
          setSuggestions([]);
        }
      } catch (e) {
        // cleanup 으로 인한 취소는 정상 — 에러 메시지 띄우지 않음.
        if (e instanceof Error && e.name === "AbortError") return;
        if (id !== requestIdRef.current) return;
        setError("장소를 찾지 못했어요. 다른 이름으로 검색해보세요.");
        setResults([]);
        setSuggestions([]);
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, activeSource]);

  // 네이버 결과 직접 선택
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
    setSuggestions([]);
    setFocusedIdx(null);
    setError(null);
  }

  // 구글 Autocomplete 후보 선택 → 상세 조회 → 확정
  async function pickSuggestion(s: Suggestion) {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/place-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detail", placeId: s.placeId }),
      });
      const data: ApiDetailResponse = await res.json();
      if (data.ok) {
        pick(data.result, "google");
      } else {
        setError("장소 정보를 가져오지 못했어요. 다시 선택해보세요.");
      }
    } catch {
      setError("장소 정보를 가져오지 못했어요. 다시 선택해보세요.");
    } finally {
      setDetailLoading(false);
    }
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
    setSuggestions([]);
    setFocusedIdx(null);
    setError(null);
    setDetailLoading(false);
  }

  function startEditing() {
    // 기존 선택값이 있으면 같은 source 로 시작 → 자연스러운 흐름.
    if (value.placeSource === "naver" || value.placeSource === "google") {
      setActiveSource(value.placeSource);
    } else {
      setActiveSource(null);
    }
    // M7 — 기존 장소명을 검색창에 prefill.
    setQuery(value.placeName ?? "");
    setResults([]);
    setSuggestions([]);
    setFocusedIdx(null);
    setError(null);
  }

  // ── (C) 선택 완료 ────────────────────────────────────────────
  const hasCoords =
    value.lat !== null &&
    value.lng !== null &&
    (value.placeSource === "naver" || value.placeSource === "google");

  const previewMarkers = useMemo<MapMarker[]>(() => {
    if (!hasCoords) return [];
    return [
      {
        lat: value.lat as number,
        lng: value.lng as number,
        name: value.placeName ?? "",
        address: value.placeAddress ?? "",
      },
    ];
  }, [hasCoords, value.lat, value.lng, value.placeName, value.placeAddress]);

  if (hasSelected && activeSource === null) {
    const sourceLabel =
      value.placeSource === "naver"
        ? "네이버"
        : value.placeSource === "google"
          ? "구글"
          : "지도";
    return (
      <div className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-base text-amber-900">
              <MapPin strokeWidth={1.75} aria-hidden className="h-4 w-4 shrink-0 text-amber-900" />
              <b>{value.placeName}</b>
              <span className="ml-1 text-sm text-amber-700">
                · {sourceLabel}
              </span>
            </p>
            {value.placeAddress && value.placeAddress !== value.placeName && (
              <p className="mt-0.5 text-sm text-ink-soft">
                {value.placeAddress}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
            >
              다른 곳으로 바꾸기
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
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
        <p className="text-base text-ink-soft">어디서 찾을지 골라보세요.</p>
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
        <p className="text-sm text-ink-soft">
          한국 장소는 네이버, 해외 장소는 구글에서 찾아보세요.
        </p>
      </div>
    );
  }

  // ── (B) 엔진 선택 후 편집 ───────────────────────────────────
  const sourceLabel = activeSource === "naver" ? "네이버" : "구글";
  const isGoogle = activeSource === "google";

  // 빈 결과 판정 — 엔진에 따라 다른 상태 참조
  const isEmpty =
    !loading &&
    !error &&
    query.trim().length >= MIN_QUERY_LEN &&
    (isGoogle ? suggestions.length === 0 : results.length === 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-ink-soft">
          <b>{sourceLabel} 지도</b>에서 검색 중이에요.
        </p>
        <button
          type="button"
          onClick={() => {
            setActiveSource(null);
            setQuery("");
            setResults([]);
            setSuggestions([]);
            setError(null);
          }}
          className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          엔진 바꾸기
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          isGoogle
            ? "장소 검색… (예: 강남역, 중산고, 도쿄역)"
            : "장소 검색… (예: 강원도 춘천, 코엑스)"
        }
        maxLength={100}
        autoFocus
        className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
      />

      {loading && <p className="text-sm text-ink-soft">검색 중…</p>}

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {error}
        </p>
      )}

      {/* 구글 — Autocomplete 후보 드롭다운 */}
      {isGoogle && !loading && !error && suggestions.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="장소 검색 결과">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pickSuggestion(s)}
                disabled={detailLoading}
                className="flex w-full min-h-[56px] items-center gap-3 rounded-md border-2 border-line bg-surface px-4 py-3 text-left text-base text-ink hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:opacity-50"
              >
                <span aria-hidden className="shrink-0 text-ink-faint">○</span>
                <span className="flex-1 min-w-0 text-base">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 구글 — 상세 조회 중 */}
      {isGoogle && detailLoading && (
        <p className="text-sm text-ink-soft">장소 정보 가져오는 중…</p>
      )}

      {/* 네이버 — Text Search 결과 목록 */}
      {!isGoogle && !loading && !error && results.length > 0 && (
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
                      : "border-line bg-surface hover:border-amber-400 hover:bg-amber-50")
                  }
                >
                  <span
                    aria-hidden
                    className={
                      "mt-1 " + (focused ? "text-amber-700" : "text-ink-faint")
                    }
                  >
                    {focused ? "●" : "○"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-ink">
                      {r.name}
                    </span>
                    {r.address && r.address !== r.name && (
                      <span className="block text-sm text-ink-soft">
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

      {isEmpty && (
        <p className="text-sm text-ink-soft">
          결과가 없어요. 다른 이름으로 검색해보세요.
        </p>
      )}

      {/* 지도 — 네이버/구글 모두 표시. 구글 autocomplete 는 coords 없어
          markers 빈 배열이지만 GoogleMap 이 기본 서울 뷰로 폴백함. */}
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
        className="self-start inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
      >
        선택 안 함 (장소 모름)
      </button>

      <p className="text-xs text-ink-faint">
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
