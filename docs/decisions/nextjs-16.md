# 결정 — Next.js 16 + App Router + Turbopack

## Problem

시니어 친화 회고 서비스의 풀스택 베이스가 필요했다. 초기 페이지가 빠르게 떠야 하고(SSR), 데이터 가까이에서 단순한 흐름으로 화면을 만들고 싶고, 별도 백엔드 API 서버는 두지 않으려 했다.

## Action

Next.js 16 (App Router + RSC + Turbopack)을 선택했다.

- `npx create-next-app@latest .` 기본값(TS / Tailwind v4 / ESLint / App Router / Turbopack / `@/*` alias)
- `/timeline` 같은 데이터 페이지는 **서버 컴포넌트**로 두고 Prisma를 직접 호출 → 별도 API 라우트 없이 DB → HTML 한 흐름
- 인증·라우트 보호는 Next 16의 새 `proxy.ts` (구 `middleware.ts`)
- Tailwind v4의 `@theme` 토큰 + 시니어 접근성(18px+ 기본, 고대비)

## Result

- `/timeline` 렌더 경로: Prisma → RSC → HTML 한 번에. API 레이어 0개.
- Turbopack HMR로 dev 피드백 사이클이 짧음(< 1초 reload).
- App Router의 sticky layout(전역 헤더)이 서버 컴포넌트로 `auth()` 호출만 추가하면 자동으로 로그인 상태에 따라 분기.
- 비용: Next 16은 신생 메이저 버전이라 일부 컨벤션이 deprecated되며 바뀜(예: `middleware.ts` → `proxy.ts`). dev 로그를 매번 확인해 즉시 마이그레이션하는 습관 필요.
