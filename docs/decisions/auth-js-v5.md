# 결정 — Auth.js v5 (`next-auth@beta`) + JWT 세션 + Prisma adapter

## Problem

- 시니어 친화적인 OAuth 1종 로그인이 필요.
- 명시 동의 게이트(개인정보 / 국외이전 / 약관)를 통과해야만 서비스에 들어올 수 있어야 함.
- **에지 런타임 미들웨어**에서 동의 여부 분기 필요 → Prisma 직접 호출은 불가.

## Action

- Auth.js v5 (`next-auth@beta`) + `@auth/prisma-adapter` + `session.strategy = "jwt"`
- 파일 분리:
  - `auth.config.ts` — Edge-safe(Provider + session 콜백만). 미들웨어와 공유.
  - `auth.ts` — Node-only. PrismaAdapter 주입 + `jwt` 콜백에서 DB의 `*ConsentAt` 3종 읽어 `token.consentComplete` 박음.
- `proxy.ts`(Next 16의 새 middleware)는 `NextAuth(authConfig).auth(...)`로 JWT만 디코딩해 분기:
  - 미로그인 → `/login`
  - 로그인 + `!consentComplete` → `/consent`
  - 그 외 → 통과
- 타입 augmentation(`types/next-auth.d.ts`)로 `session.user.id`, `session.consentComplete`, `JWT.consentComplete` 선언.

## Result

- 에지에서 DB 호출 없이 동의 분기 가능 → 미들웨어 응답 빠름.
- `/timeline`·`/consent` 무세션 접근 시 307 → `/login` 검증 완료.
- 동의 완료 후엔 JWT가 새로고침되면서 자동으로 보호 경로 통과.
- 트레이드오프:
  - `jwt` 콜백이 토큰 갱신 시마다 User row를 다시 읽으므로 미세한 추가 쿼리 발생. 대량 트래픽 단계에선 캐싱 필요.
  - 카카오 / 네이버는 시니어·국내 사용자 대상이라 출시 직전 추가하기로 미룸. `auth.config.ts`에 메모만.
  - Google Cloud Console에서 OAuth client 발급은 사용자가 수동으로 해야 함(`.env`의 `AUTH_GOOGLE_ID` / `SECRET`).
