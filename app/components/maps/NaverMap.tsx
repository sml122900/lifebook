"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { type MapProps, SEOUL_CITY_HALL } from "./types";

// Phase Place — 네이버 지도 타일 렌더.
//
// SDK 로드: <Script src="https://oapi.map.naver.com/openapi/v3/maps.js">
// next/script 가 같은 src 는 dedupe. 컴포넌트가 여러 곳에서 마운트돼도
// 스크립트는 한 번만 로드됨.
//
// 로딩 흐름:
//   1) <Script> 렌더 → afterInteractive 로 비동기 다운로드
//   2) 100ms 폴링으로 window.naver?.maps 등장 감지 → ready=true
//   3) ready 되면 mapRef 에 Map 인스턴스 1회 생성
//   4) markers 가 바뀌면 old marker setMap(null) → new marker 생성
//   5) focusedIdx 가 바뀌면 InfoWindow open + 지도 중심 이동
//
// 마커 click → onMarkerClick(idx) — 호출자가 결과 pick 로 연결.

// 신형 NCP Maps 키(X-NCP-APIGW-API-KEY-ID 라벨) 는 파라미터 이름이
// ncpKeyId. 구형 ncpClientId 로 신형 키를 쓰면 "200 Authentication
// Failed" 가 떨어진다. 환경변수 이름은 호환성 위해 그대로 두고
// 파라미터만 신형 규격으로.
const SCRIPT_SRC = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? ""}`;

export function NaverMap({
  markers,
  focusedIdx,
  className,
  onMarkerClick,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRefs = useRef<naver.maps.Marker[]>([]);
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SDK 준비 감지 — strict mode 더블 마운트도 안전(이미 ready 면 즉시 set).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.naver?.maps) {
      setReady(true);
      return;
    }
    let elapsed = 0;
    const intervalId = window.setInterval(() => {
      elapsed += 100;
      if (window.naver?.maps) {
        setReady(true);
        window.clearInterval(intervalId);
      } else if (elapsed > 10000) {
        setError("지도를 불러오지 못했어요.");
        window.clearInterval(intervalId);
      }
    }, 100);
    return () => window.clearInterval(intervalId);
  }, []);

  // Map 인스턴스 1회 생성.
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const naverNs = window.naver;
    mapRef.current = new naverNs.maps.Map(containerRef.current, {
      center: new naverNs.maps.LatLng(
        SEOUL_CITY_HALL.lat,
        SEOUL_CITY_HALL.lng,
      ),
      zoom: 12,
    });
    infoWindowRef.current = new naverNs.maps.InfoWindow({
      content: "",
      anchorSize: new naverNs.maps.Size(0, 0),
      borderColor: "#d97706", // amber-600
      pixelOffset: new naverNs.maps.Point(0, -10),
    });
  }, [ready]);

  // markers 변경 시 마커 재생성 + 뷰 맞춤.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const naverNs = window.naver;
    // 기존 마커 정리.
    for (const m of markerRefs.current) m.setMap(null);
    markerRefs.current = [];
    infoWindowRef.current?.close();

    if (markers.length === 0) {
      // 마커 없으면 기본 중심으로 복귀.
      mapRef.current.setCenter(
        new naverNs.maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng),
      );
      mapRef.current.setZoom(12);
      return;
    }

    // 마커 생성 + 클릭 핸들러.
    markers.forEach((mk, idx) => {
      const marker = new naverNs.maps.Marker({
        position: new naverNs.maps.LatLng(mk.lat, mk.lng),
        map: mapRef.current!,
      });
      naverNs.maps.Event.addListener(marker, "click", () => {
        onMarkerClick?.(idx);
      });
      markerRefs.current.push(marker);
    });

    // 뷰 맞춤.
    if (markers.length === 1) {
      mapRef.current.setCenter(
        new naverNs.maps.LatLng(markers[0].lat, markers[0].lng),
      );
      mapRef.current.setZoom(15);
    } else {
      const bounds = new naverNs.maps.LatLngBounds(
        new naverNs.maps.LatLng(markers[0].lat, markers[0].lng),
        new naverNs.maps.LatLng(markers[0].lat, markers[0].lng),
      );
      for (const mk of markers) {
        bounds.extend(new naverNs.maps.LatLng(mk.lat, mk.lng));
      }
      mapRef.current.fitBounds(bounds);
    }
  }, [markers, ready, onMarkerClick]);

  // focusedIdx 강조 — InfoWindow + 중심.
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
    const naverNs = window.naver;
    const mk = markers[focusedIdx];
    const marker = markerRefs.current[focusedIdx];
    if (!marker || !infoWindowRef.current) return;
    const html = `<div style="padding:10px 12px;font-size:14px;line-height:1.45;max-width:240px"><b>${escape(mk.name)}</b>${mk.address && mk.address !== mk.name ? `<br><span style="color:#555;font-size:13px">${escape(mk.address)}</span>` : ""}</div>`;
    infoWindowRef.current.setContent(html);
    infoWindowRef.current.open(mapRef.current, marker);
    mapRef.current.panTo(new naverNs.maps.LatLng(mk.lat, mk.lng));
  }, [focusedIdx, markers, ready]);

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" />
      <div
        className={
          "relative w-full overflow-hidden rounded-md border-2 border-zinc-200 bg-zinc-50 " +
          (className ?? "h-[200px]")
        }
      >
        {!ready && !error && (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-600">
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
    </>
  );
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
