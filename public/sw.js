// Lifebook 서비스워커 — 아주 보수적인 캐싱 정책.
//
// 캐시하는 것: /_next/static/* (콘텐츠 해시 파일명이라 불변) 과 /icons/* 뿐.
// 캐시하지 않는 것: 페이지·API·서버 액션·RSC 데이터 — 전부 항상 네트워크로
// 보낸다. 배포 후 "안 바뀜" 사고를 원천 차단하는 게 최우선 원칙.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `lifebook-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isCacheableStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // 페이지 이동만 오프라인 폴백 대상. 그 외(API·서버 액션·데이터 fetch)는
  // 이 핸들러가 손대지 않고 브라우저가 평소대로 네트워크로 보낸다.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
