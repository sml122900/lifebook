# 트러블슈팅 — 랜딩 OG 이미지가 미들웨어에 막혀 미리보기가 안 뜸

## 문제 상황

카카오톡·문자 링크 공유 미리보기용으로 `app/opengraph-image.tsx`(동적 OG 이미지)를 추가하고 dev 에서 확인했더니 — 이미지가 아니라 **HTML(로그인 페이지)** 이 돌아왔다.

```
GET /opengraph-image  →  STATUS 200, Content-Type: text/html (23,828 bytes)
```

이미지(`image/png`)가 와야 하는데 text/html. 게다가 build 로그에는 `○ /opengraph-image` 가 정적 생성으로 정상 잡혀 있어 "라우트는 맞는데 왜?" 였다.

## 시도한 것들

1. **리다이렉트 추적** — `Invoke-WebRequest -MaximumRedirection 0` 로 다시 치니 **307** 이 떴다. 즉 200 HTML 은 리다이렉트를 따라간 끝의 `/login` 이었다.
2. **미들웨어 matcher 확인** — `proxy.ts` 의 matcher 는 `"/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"`. 핵심은 `.*\\.` — **경로에 점(.)이 있으면 제외**. 그런데 OG 라우트 경로는 `/opengraph-image` 로 **점이 없다** → matcher 에 안 걸러지고 미들웨어를 탄다.
3. **연결** — 미들웨어는 `PUBLIC_PATHS`(`/`, `/login`, `/privacy`)에 없는 경로를 비로그인 시 `/login` 으로 redirect. 카카오톡 크롤러는 로그인 세션이 없으니 → 이미지 대신 `/login` 을 받는다. **프로덕션에서도 동일** — og:image URL(`/opengraph-image?<hash>`)도 점이 없어 똑같이 막힌다.

## 최종 해결법

`proxy.ts` 의 `PUBLIC_PATHS` 에 `/opengraph-image` 등록:

```ts
const PUBLIC_PATHS = new Set<string>([
  "/", "/login", "/privacy",
  "/opengraph-image",   // 카톡·문자 크롤러가 받아가는 OG 썸네일
]);
```

재확인: `GET /opengraph-image` → **200 / image/png / 40,502 bytes**. 랜딩 HTML 에 og:image·twitter:image 태그도 절대 URL 로 정상 노출.

추가로 발견한 인접 함정: **Next.js 는 `openGraph` 객체를 깊은 병합하지 않는다.** layout 에 `openGraph: { siteName, locale, type }` 를 두고 page 가 `openGraph: { title, description }` 를 주면, page 것이 통째로 대체해 siteName/locale/type 이 사라진다. 랜딩(가장 많이 공유될 페이지)에서 siteName 등을 다시 명시해 보존했다.

## 교훈

(1) Next 미들웨어 matcher 의 `.*\\.` 제외는 "정적 파일은 점이 있다"는 가정인데, **메타데이터 파일 컨벤션 라우트(`opengraph-image`/`icon`/`sitemap` 등)는 점 없는 경로**라 이 그물을 빠져나가 인증 게이트에 걸린다. 외부 크롤러가 받아야 하는 라우트는 PUBLIC 으로 명시해야 한다. (2) "200 인데 내용이 이상"하면 리다이렉트를 의심 — `MaximumRedirection 0` 로 진짜 상태코드를 봐야 한다.

## 이력서 한 줄

OG 이미지가 카톡 미리보기에 안 뜨는 문제를, 미들웨어 matcher 의 점(.) 기반 정적파일 제외 규칙이 점 없는 메타데이터 라우트(`/opengraph-image`)를 걸러내지 못해 인증 리다이렉트로 빠지는 것으로 진단 — PUBLIC 경로 등록으로 크롤러 접근을 열고, Next 의 openGraph 비-병합 특성까지 함께 보정.
