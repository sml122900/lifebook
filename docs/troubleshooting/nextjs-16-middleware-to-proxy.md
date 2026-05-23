# 트러블슈팅 — Next.js 16의 `middleware.ts` → `proxy.ts` 마이그레이션

## 문제 상황

Phase 3.4에서 라우트 보호 로직을 `middleware.ts`에 작성. `proxy.ts` 변경 전 검증:

| 경로                  | 기대        | 실제      |
| --------------------- | ----------- | --------- |
| `/timeline` (무세션)  | 307→/login  | **200**   |
| `/consent` (무세션)   | 307→/login  | **200**   |

즉, 미들웨어가 전혀 실행되지 않은 채 페이지가 그대로 응답.

## 시도한 것들

1. dev 서버 재시작 → 변화 없음.
2. matcher 패턴(`["/((?!_next/static|_next/image|favicon.ico).*)"]`)을 의심해 더 단순한 패턴으로 교체 → 동일.
3. 미들웨어 함수 내부에 `console.log` 박아도 출력되지 않음 → **파일이 인식되지 않는 게 확실.**
4. dev 서버 stdout을 직접 읽어보니 다음 경고 발견:
   ```
   ⚠ The "middleware" file convention is deprecated.
     Please use "proxy" instead.
   ```

## 최종 해결법

Next.js 16부터 미들웨어 파일명이 **`middleware.ts` → `proxy.ts`**로 바뀌었다. API(`export default auth((req) => ...)`, `export const config = {...}`)는 그대로.

```powershell
Move-Item middleware.ts proxy.ts
```

이후 재검증:

| 경로                  | 결과               |
| --------------------- | ------------------ |
| `/timeline` (무세션)  | 307 → `/login` ✅ |
| `/consent` (무세션)   | 307 → `/login` ✅ |
| `/` (공개)            | 200 ✅            |

## 이력서 소재 한 줄

Next.js 16 deprecation 경고를 dev stdout에서 즉시 발견 → 파일명 한 줄 변경(`middleware.ts` → `proxy.ts`)으로 라우트 보호 정상화, 디버깅 시간 5분 이내 종결.
