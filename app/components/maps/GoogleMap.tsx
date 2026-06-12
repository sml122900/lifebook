"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

import { type MapProps, SEOUL_CITY_HALL } from "./types";

// Phase Place — 구글 지도 타일 렌더.
//
// SDK 로드: @googlemaps/js-api-loader v2 의 함수형 API (setOptions +
// importLibrary). 두 함수 모두 idempotent — 여러 컴포넌트가 mount 돼도
// 같은 Promise 재사용.
//
// 라이프사이클은 NaverMap 과 같은 구조:
//   ready → Map 1회 생성 → markers prop 변경 시 재생성 → focusedIdx 강조.

setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  v: "weekly",
});

export function GoogleMap({
  markers,
  focusedIdx,
  className,
  onMarkerClick,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SDK 로드 — Map + Marker + InfoWindow 라이브러리만.
  useEffect(() => {
    let cancelled = false;
    Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("지도를 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Map 인스턴스 1회 생성.
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: SEOUL_CITY_HALL,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    infoWindowRef.current = new google.maps.InfoWindow();
  }, [ready]);

  // markers 변경 시 재생성 + 뷰 맞춤.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    for (const m of markerRefs.current) m.setMap(null);
    markerRefs.current = [];
    infoWindowRef.current?.close();

    if (markers.length === 0) {
      mapRef.current.setCenter(SEOUL_CITY_HALL);
      mapRef.current.setZoom(12);
      return;
    }

    markers.forEach((mk, idx) => {
      const marker = new google.maps.Marker({
        position: { lat: mk.lat, lng: mk.lng },
        map: mapRef.current!,
      });
      marker.addListener("click", () => {
        onMarkerClick?.(idx);
      });
      markerRefs.current.push(marker);
    });

    if (markers.length === 1) {
      mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
      mapRef.current.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      for (const mk of markers) bounds.extend({ lat: mk.lat, lng: mk.lng });
      mapRef.current.fitBounds(bounds);
    }
  }, [markers, ready, onMarkerClick]);

  // focusedIdx 강조.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (
      focusedIdx === null ||
      focusedIdx < 0 ||
      focusedIdx >= markers.length
    ) {
      infoWindowRef.current?.close();
      return;
    }
    const mk = markers[focusedIdx];
    const marker = markerRefs.current[focusedIdx];
    if (!marker || !infoWindowRef.current) return;
    const html = `<div style="padding:6px 8px;font-size:14px;line-height:1.45;max-width:240px"><b>${escape(mk.name)}</b>${mk.address && mk.address !== mk.name ? `<br><span style="color:#555;font-size:13px">${escape(mk.address)}</span>` : ""}</div>`;
    infoWindowRef.current.setContent(html);
    infoWindowRef.current.open({ anchor: marker, map: mapRef.current });
    mapRef.current.panTo({ lat: mk.lat, lng: mk.lng });
  }, [focusedIdx, markers, ready]);

  return (
    <div
      className={
        "relative w-full overflow-hidden rounded-md border-2 border-line bg-canvas " +
        (className ?? "h-[200px]")
      }
    >
      {!ready && !error && (
        <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-ink-soft">
          지도를 불러오는 중이에요…
        </p>
      )}
      {error && (
        <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-amber-900">
          {error}
        </p>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
