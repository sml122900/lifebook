# 트러블슈팅 — `window is not defined` (지도 SDK 의 모듈 최상단 window 접근)

## 문제 상황

사진 인물·장소 매칭(C)을 붙이며 `PlaceSearchInput`(지도 검색 + 타일)을 `/life-timeline`(TimelineView)에 처음 import 한 직후, 페이지가 500:

```
⨯ ReferenceError: window is not defined
    at module evaluation (app/components/maps/GoogleMap.tsx:3:1)
    at module evaluation (app/components/maps/PlaceMap.tsx:3:1)
    at module evaluation (app/components/PlaceSearchInput.tsx:7:1)
    at module evaluation (app/life-timeline/TimelineView.tsx:7:1)

> 3 | import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
```

`GoogleMap.tsx` 도 `PlaceSearchInput` 도 모두 `"use client"` 인데도 서버에서 터졌다. 사용자 증상은 "사진에서 장소를 추가하니 에러" — 에러 바운더리(`app/error.tsx`) 폴백 화면.

증상이 일관되지 않았다: **콜드 컴파일 직후 첫 요청만 500, 다음 요청부터 200**. 그래서 "가끔 깨짐"처럼 보였다.

## 시도한 것들

1. `/life-timeline/add`(EventForm → 같은 `PlaceSearchInput`)는 같은 세션에서 200 으로 떴다 → "GoogleMap 모듈 평가가 서버에서 무조건 터지는 건 아닌가?" 의심. 하지만 add 도 콜드 첫 요청은 같은 위험이었음(워밍돼 있었을 뿐).
2. 콜드/워밍 패턴 관찰 — `✓ Compiled` 직후 첫 `GET /life-timeline` 만 500, 이후 200 반복. dev HMR 의 일시 현상으로 의심.
3. **패키지 dist 직접 확인**으로 확정:

```bash
grep -n "window" node_modules/@googlemaps/js-api-loader/dist/index.js
# 47: const trustedTypes = window.trustedTypes;   ← 함수 밖, 모듈 최상단
```

근본 원인: **`@googlemaps/js-api-loader` 가 모듈 로드 시점(최상단)에 `window.trustedTypes` 를 평가**한다. `"use client"` 컴포넌트라도 Next.js 는 SSR HTML 생성을 위해 그 모듈을 *서버에서 평가*한다 → `window` 없음 → throw. "콜드 첫 요청만 500" 인 이유: Turbopack dev 가 갓 컴파일한 클라 청크를 서버에서 한 번 평가하다 터지고, 이후엔 캐시된 평가 결과로 워밍 서빙. **즉 dev 일시 현상이 아니라 "워밍 전엔 항상" 터지는 결정적 버그.** production SSR 에서도 동일 위험(동적 라우트라 build 프리렌더가 안 잡음).

## 최종 해결법

지도는 **순수 인터랙션 요소(SEO 가치 X)** 이므로 SSR 에서 빼는 게 정답. `PlaceSearchInput` 에서 `PlaceMap` 을 `next/dynamic` 의 `ssr: false` 로 로드:

```ts
// app/components/PlaceSearchInput.tsx  ("use client")
import dynamic from "next/dynamic";

const PlaceMap = dynamic(
  () => import("./maps/PlaceMap").then((m) => m.PlaceMap),
  { ssr: false },
);
```

(JSX 사용처 `<PlaceMap ... />` 는 그대로 — 타입은 dynamic 이 추론.) 이렇게 하면 `PlaceMap → GoogleMap/NaverMap → @googlemaps/js-api-loader` 전체 체인이 서버 모듈 그래프에서 빠진다. `PlaceMap` 컴포넌트가 자체 로딩 상태를 이미 가지므로 `loading` placeholder 불필요.

검증: 픽스 후 dev 로그에서 `✓ Compiled` 직후 첫 `GET /life-timeline` 이 **200**(이전엔 매 콜드 컴파일 첫 요청 500). `/life-timeline/add`·`/photos` 도 같은 체인이라 함께 단단해짐.

## 핵심 학습

- **모듈 최상단에서 `window`/`document` 를 만지는 라이브러리는 `"use client"` 여도 SSR 모듈 평가에서 터진다.** 클라 컴포넌트도 서버에서 평가된다는 점이 함정.
- 진단의 결정타는 **패키지 dist 를 직접 grep** — "함수 안인가 최상단인가"가 SSR-safe 여부를 가른다.
- "콜드 컴파일 첫 요청만 500" 은 일시 현상이 아니라 **워밍 전엔 항상** — 메인 동선에 들어오는 순간 반드시 잡아야 한다.
- 표준 해법은 `next/dynamic({ ssr: false })`. 지도·차트·에디터 등 브라우저 전용 위젯의 정석.
- 같은 위험이 `NaverMap`(next/script lazy)·`GoogleMap` 둘 다에 잠재 — `PlaceMap`(dispatcher) 한 곳에서 dynamic 으로 감싸 모든 사용처를 한 번에 차단.

## 이력서 소재 한 줄

`"use client"` 컴포넌트가 SSR 모듈 평가에서 `window is not defined` 로 터지는 원인을, 패키지 dist 의 최상단 `window` 접근까지 추적해 규명 → 브라우저 전용 지도 SDK 를 `next/dynamic({ ssr:false })` 로 격리해 메인 페이지의 콜드-SSR 500 을 근본 차단.
