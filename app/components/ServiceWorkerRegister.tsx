"use client";

import { useEffect } from "react";

// 프로덕션에서만 서비스워커를 등록한다 — dev 모드는 HMR 과 캐싱이 섞이면
// 혼란스러워서 의도적으로 끔.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
