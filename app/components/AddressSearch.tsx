"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

// 카카오(다음) 우편번호 서비스 공용 컴포넌트. 키 불필요·무료·무제한.
// embed 레이어 모드 — 모바일·어르신 친화(팝업 차단·새 창 전환 없음).
//
// 한 번 검색으로 우편번호·도로명·지번을 모두 받아 부모로 올린다(onComplete).
// 부모는 상세주소(동·호)만 따로 입력받는다. 카카오 스크립트·로고는 수정 금지.

const KAKAO_POSTCODE_SRC =
  "//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

export type AddressResult = {
  postalCode: string; // 우편번호(5자리)
  roadAddress: string; // 도로명 주소(건물명 부가)
  jibunAddress: string; // 지번 주소
};

// 카카오 Postcode 콜백 데이터(쓰는 필드만).
type DaumPostcodeData = {
  zonecode?: string;
  roadAddress?: string;
  address?: string;
  jibunAddress?: string;
  autoJibunAddress?: string;
  buildingName?: string;
};
declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: DaumPostcodeData) => void;
        onclose?: (state: string) => void;
        width?: string | number;
        height?: string | number;
      }) => { embed: (el: HTMLElement) => void };
    };
  }
}

const READONLY_FIELD =
  "w-full rounded-md border-2 border-line bg-canvas px-4 py-3 text-lg text-ink";

export function AddressSearch({
  postalCode,
  roadAddress,
  jibunAddress,
  onComplete,
}: {
  postalCode: string;
  roadAddress: string;
  jibunAddress: string;
  onComplete: (r: AddressResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  // 콜백을 ref 로 고정 — effect 의존성에서 빼 레이어가 떠 있는 동안 부모 리렌더로
  // 재embed(iframe 중복) 되는 것을 막는다.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 다른 폼에서 이미 스크립트를 로드했으면(window.daum 존재) 바로 준비됨.
  useEffect(() => {
    if (typeof window !== "undefined" && window.daum?.Postcode) setReady(true);
  }, []);

  // 레이어 열림 + 스크립트 준비됐을 때 embed. 닫히면 정리.
  useEffect(() => {
    if (!open || !ready) return;
    const el = layerRef.current;
    if (!el || !window.daum?.Postcode) return;
    el.innerHTML = ""; // 재오픈 시 iframe 중복 방지
    new window.daum.Postcode({
      oncomplete: (data) => {
        const building = data.buildingName ? ` (${data.buildingName})` : "";
        onCompleteRef.current({
          postalCode: data.zonecode ?? "",
          roadAddress: (data.roadAddress || data.address || "") + building,
          jibunAddress: data.jibunAddress || data.autoJibunAddress || "",
        });
        setOpen(false);
      },
      onclose: () => setOpen(false),
      width: "100%",
      height: "100%",
    }).embed(el);
  }, [open, ready]);

  return (
    <>
      <Script
        src={KAKAO_POSTCODE_SRC}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />

      <div className="flex flex-col gap-2">
        <span className="text-lg font-semibold text-ink">
          우편번호·주소<span className="ml-1 text-action">*</span>
        </span>

        <div className="flex gap-2">
          <input
            type="text"
            value={postalCode}
            readOnly
            placeholder="우편번호"
            aria-label="우편번호"
            className={READONLY_FIELD + " w-32"}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-md border-2 border-action bg-banner px-5 py-3 text-lg font-bold text-action hover:bg-action hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            우편번호 찾기
          </button>
        </div>

        <input
          type="text"
          value={roadAddress}
          readOnly
          placeholder="'우편번호 찾기'를 누르면 주소가 채워져요"
          aria-label="도로명 주소"
          className={READONLY_FIELD}
        />
        {jibunAddress && (
          <p className="text-sm text-ink-faint">지번: {jibunAddress}</p>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="우편번호 검색"
        >
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-lg font-bold text-ink">우편번호 찾기</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] px-3 text-base font-semibold text-ink-soft hover:text-ink"
              >
                닫기 ✕
              </button>
            </div>
            <div ref={layerRef} className="h-[480px] w-full" />
          </div>
        </div>
      )}
    </>
  );
}
