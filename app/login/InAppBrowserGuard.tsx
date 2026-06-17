"use client";

import { useEffect, useState } from "react";

type InAppKind = "none" | "android" | "ios";

function detectInApp(): InAppKind {
  if (typeof navigator === "undefined") return "none";
  const ua = navigator.userAgent;
  const inApp = /KAKAOTALK|Instagram|NAVER|FBAN|FBAV|FB_IAB/i.test(ua);
  if (!inApp) return "none";
  return /Android/i.test(ua) ? "android" : "ios";
}

function openExternal(): void {
  const ua = navigator.userAgent;
  const url = window.location.href;
  if (/KAKAOTALK/i.test(ua)) {
    // KakaoTalk 전용 외부 열기 API
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  } else {
    // 범용 Android intent — Chrome 우선, 미설치 시 무시
    window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
  }
}

/** Android 인앱: mount 즉시 외부 브라우저 열기 시도. iOS/기타: 투명 pass-through. */
export function InAppBrowserGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (detectInApp() === "android") openExternal();
  }, []);
  return <>{children}</>;
}

/** iOS 인앱일 때만 렌더 — 폼 상단 amber 안내 배너. */
export function InAppIosBanner() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShow(detectInApp() === "ios");
  }, []);

  if (!show) return null;

  function copyUrl() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } else {
      // 구형 iOS 폴백
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <p className="font-semibold text-amber-900">구글 로그인은 Safari에서 해주세요</p>
      <p className="mt-1.5 text-amber-800">
        화면 하단(또는 상단){" "}
        <span className="font-semibold">···</span> 메뉴 →{" "}
        <span className="font-semibold">Safari로 열기</span>를 눌러주세요.
      </p>
      <p className="mt-1 font-medium text-emerald-700">
        카카오·네이버 로그인은 여기서도 됩니다.
      </p>
      <button
        type="button"
        onClick={copyUrl}
        className="mt-3 rounded-md bg-amber-200 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {copied ? "복사됐어요 ✓" : "주소 복사하기"}
      </button>
    </div>
  );
}

/** 인앱 브라우저(iOS·Android 공통)일 때 구글 버튼 아래 한 줄 안내. */
export function InAppGoogleNote() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(detectInApp() !== "none");
  }, []);
  if (!show) return null;
  return (
    <p className="text-center text-sm text-ink-soft">
      구글 로그인은 외부 브라우저(Safari·Chrome)에서만 동작해요.
    </p>
  );
}
