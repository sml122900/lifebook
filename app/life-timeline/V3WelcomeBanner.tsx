"use client";

import { useEffect, useState } from "react";

// Phase L5 — 첫 방문 안내. v2(월별 타임머신) 에 익숙한 기존 사용자에게
// "메인이 인생 연혁으로 바뀌었어요" 를 한 번 보여 주고 닫으면 끝.
//
// localStorage 만 사용 — 새 DB 컬럼/모델 0. 닫으면 같은 브라우저에선
// 다시 안 보임. 다른 브라우저/탭에서 처음 보면 또 1회. 가벼운 안내라
// 정확한 "사용자당 한 번" 까진 필요 없다 (어차피 한 줄 메시지).

const STORAGE_KEY = "v3-welcome-seen";

export function V3WelcomeBanner() {
  // SSR 은 안 보이게 — mount 후 localStorage 확인.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    setShow(true);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-md border-2 border-violet-300 bg-violet-50 px-5 py-4"
    >
      <p className="flex-1 text-base text-violet-900 sm:text-lg">
        <b>Lifebook 이 새로워졌어요.</b> 이제 인생 연혁이 메인이에요 — 매달
        채우는 부담 없이 큰 줄기만 잡으시면 돼요.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border-2 border-violet-300 text-xl font-bold text-violet-700 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        ✕
      </button>
    </div>
  );
}
