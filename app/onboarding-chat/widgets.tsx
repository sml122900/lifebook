"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceInfo } from "@/lib/place-types";

// Place 검색 로직은 /api/place-search 엔드포인트 재사용 (PlaceSearchInput 동일 패턴)
const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

type PlaceResult = { name: string; address: string; lat: number | null; lng: number | null };
type Suggestion = { text: string; placeId: string };

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
// F5: 검색창 항상 노출 (네이버 기본) + "구글로 전환" 옵션.
// 결과 클릭 → 좌표 포함 추가. 결과 없거나 건너뛰면 → 텍스트만 추가.
// 검색 API: /api/place-search (PlaceSearchInput 동일 엔드포인트 재사용).
// onSubmit(names, places, qKey) — places 는 PlaceInfo 배열(좌표 없으면 EMPTY_PLACE).

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
  const [items, setItems] = useState<PlaceItem[]>([]);

  // 검색 상태 — 네이버 기본
  const [source, setSource] = useState<"naver" | "google">("naver");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Debounce 검색 — /api/place-search 재사용 (PlaceSearchInput 동일 패턴)
  useEffect(() => {
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
        const isGoogle = source === "google";
        const body = isGoogle
          ? JSON.stringify({ action: "autocomplete", query: trimmed })
          : JSON.stringify({ query: trimmed, source });
        const res = await fetch("/api/place-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: ctrl.signal,
        });
        if (id !== requestIdRef.current) return;

        if (isGoogle) {
          const data = (await res.json()) as {
            ok: boolean;
            suggestions?: Suggestion[];
            error?: string;
          };
          if (!data.ok) {
            setError(data.error ?? "장소를 찾지 못했어요.");
            setSuggestions([]);
          } else {
            setSuggestions(data.suggestions ?? []);
          }
          setResults([]);
        } else {
          const data = (await res.json()) as {
            ok: boolean;
            results?: PlaceResult[];
            error?: string;
          };
          if (!data.ok) {
            setError(data.error ?? "장소를 찾지 못했어요.");
            setResults([]);
          } else {
            setResults(data.results ?? []);
          }
          setSuggestions([]);
        }
      } catch (e) {
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
  }, [query, source]);

  function resetSearch() {
    setQuery("");
    setResults([]);
    setSuggestions([]);
    setError(null);
  }

  function addItem(name: string, place: PlaceInfo) {
    const trimmedName = name.trim();
    if (!trimmedName || items.some((i) => i.name === trimmedName)) return;
    setItems((prev) => [...prev, { name: trimmedName, place }]);
    resetSearch();
  }

  function addWithCoords(
    name: string,
    address: string | null,
    lat: number | null,
    lng: number | null,
    src: "naver" | "google",
  ) {
    addItem(name, { placeName: name, placeAddress: address, lat, lng, placeSource: src });
  }

  async function pickSuggestion(s: Suggestion) {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/place-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detail", placeId: s.placeId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        result?: PlaceResult;
        error?: string;
      };
      if (data.ok && data.result) {
        addWithCoords(
          data.result.name,
          data.result.address || null,
          data.result.lat,
          data.result.lng,
          "google",
        );
      } else {
        setError("장소 정보를 가져오지 못했어요. 다시 선택해보세요.");
      }
    } catch {
      setError("장소 정보를 가져오지 못했어요. 다시 선택해보세요.");
    } finally {
      setDetailLoading(false);
    }
  }

  // 결과 없거나 "선택 안 함" — 텍스트로만 추가 (좌표 없이)
  function addTextOnly() {
    const t = query.trim();
    if (!t) return;
    addItem(t, { ...EMPTY_PLACE, placeName: t });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function switchSource(next: "naver" | "google") {
    setSource(next);
    setResults([]);
    setSuggestions([]);
    setError(null);
    // query 유지 — 전환 즉시 재검색 트리거
  }

  const trimmedQuery = query.trim();
  const isEmptyResult =
    !loading &&
    !error &&
    trimmedQuery.length >= MIN_QUERY_LEN &&
    (source === "google" ? suggestions.length === 0 : results.length === 0);

  return (
    <div className="space-y-3">
      {/* 추가된 항목 칩 */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => (
            <span
              key={`${item.name}-${idx}`}
              className={[
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-[15px]",
                item.place.lat !== null
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800",
              ].join(" ")}
            >
              {item.place.lat !== null && <span aria-hidden>📍</span>}
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
          ))}
        </div>
      )}

      {/* 검색 엔진 헤더 + 전환 버튼 */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-[var(--color-ink)]">
          {source === "naver" ? "🗺️ 네이버 지도 검색" : "🌍 구글 지도 검색"}
        </span>
        <button
          type="button"
          onClick={() => switchSource(source === "naver" ? "google" : "naver")}
          disabled={disabled}
          className="text-[13px] text-[var(--color-brand)] underline-offset-2 hover:underline disabled:opacity-50"
        >
          {source === "naver" ? "구글로 전환" : "네이버로 전환"}
        </button>
      </div>

      {/* 검색 입력 (항상 노출) */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          source === "naver"
            ? (placeholder || "장소 이름 검색… (예: 서울 마포구)")
            : "장소 이름 검색… (예: 강남역, Tokyo Station)"
        }
        disabled={disabled}
        className="w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-[17px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
      />

      {loading && (
        <p className="text-[14px] text-[var(--color-ink-subtle)]">검색 중…</p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-900"
        >
          {error}
        </p>
      )}

      {/* 네이버 결과 */}
      {source === "naver" && !loading && !error && results.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="장소 검색 결과">
          {results.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <button
                type="button"
                onClick={() =>
                  addWithCoords(r.name, r.address || null, r.lat, r.lng, "naver")
                }
                disabled={disabled}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand)] hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-brand)] disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-medium text-[var(--color-ink)]">
                    {r.name}
                  </span>
                  {r.address && r.address !== r.name && (
                    <span className="block text-[14px] text-[var(--color-ink-subtle)]">
                      {r.address}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-[13px] font-semibold text-[var(--color-brand)]"
                >
                  추가 +
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 구글 Autocomplete 결과 */}
      {source === "google" && !loading && !error && suggestions.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="장소 검색 결과">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pickSuggestion(s)}
                disabled={detailLoading || disabled}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-left hover:border-[var(--color-brand)] hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-brand)] disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 text-[17px] text-[var(--color-ink)]">
                  {s.text}
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-[13px] font-semibold text-[var(--color-brand)]"
                >
                  {detailLoading ? "…" : "추가 +"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {source === "google" && detailLoading && (
        <p className="text-[14px] text-[var(--color-ink-subtle)]">
          장소 정보 가져오는 중…
        </p>
      )}

      {isEmptyResult && (
        <p className="text-[14px] text-[var(--color-ink-subtle)]">
          결과가 없어요. 다른 이름으로 검색해보세요.
        </p>
      )}

      {/* 텍스트로만 추가 — 결과 없거나 선택 안 할 때 */}
      {trimmedQuery && (
        <button
          type="button"
          onClick={addTextOnly}
          disabled={disabled}
          className="w-full min-h-[48px] rounded-xl border border-dashed border-[var(--color-line)] bg-white px-4 py-2 text-left text-[15px] text-[var(--color-ink-subtle)] hover:border-[var(--color-brand)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-brand)] disabled:opacity-50"
        >
          📝 &ldquo;{trimmedQuery}&rdquo; 장소 검색 없이 추가
        </button>
      )}

      {/* 완료 */}
      <button
        type="button"
        onClick={() =>
          onSubmit(
            items.map((i) => i.name),
            items.map((i) => i.place),
            qKey,
          )
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
