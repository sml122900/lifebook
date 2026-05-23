# 이력서 소재 모음 (PAR)

## 시니어 친화 회고 서비스의 풀스택 베이스 구축

- **Problem**: 30대~70대 폭넓은 사용자, 특히 고령층까지 편하게 쓰는 회고 서비스가 필요. 4개 분리된 layer(인증/동의/데이터/UI)가 첫날부터 모두 동작해야 다음 phase에서 막힘 없이 진행 가능.
- **Action**: Next.js 16 (App Router + RSC + Turbopack) + Postgres/pgvector + Prisma 7 + Auth.js v5 풀스택을 한 세션에 셋업. 서버 컴포넌트에서 Prisma 직접 호출(별도 API 레이어 0), JWT 세션 + 에지 미들웨어로 라우트 보호, 시니어 접근성(본문 18px+, 카드 88px, 4px focus ring)을 기본값으로 채택.
- **Result**: Phase 0→3 (셋업·데이터·UI·인증) 4단계 완료. 32개 검증된 앵커 이벤트 시드, 1979→2025 연도순 타임라인 정적 렌더, OAuth + 명시 동의 게이트, 무세션 접근 시 307 리다이렉트 모두 검증. 총 25 commit으로 모든 변경 단위가 추적 가능한 상태.

## Prisma 7 driver adapter 패턴으로의 마이그레이션

- **Problem**: Prisma 7부터 PrismaClient 생성자가 `datasourceUrl` / `datasources` 같은 클래식 옵션을 전부 거부. 공식 문서가 충분히 따라잡지 못한 상태에서 첫 DB 핑이 실패.
- **Action**: 에러 메시지를 단서로 생성된 타입 정의(`PrismaClientOptions` 유니온 타입)를 역추적, `adapter | accelerateUrl` 두 가지만 허용됨을 확인. `@prisma/adapter-pg` + `pg`를 도입해 driver adapter 패턴으로 전환.
- **Result**: `SELECT 1` 핑 정상, `@auth/prisma-adapter`(Auth.js)와도 추가 설정 없이 호환. 신생 메이저 버전이라 동일한 함정에 빠질 다음 개발자를 위해 결정 문서(`docs/decisions/prisma-7.md`)와 트러블슈팅 문서(`docs/troubleshooting/prisma-7-client-options.md`)로 정리.

## Edge 미들웨어에서 동의 게이트 분기

- **Problem**: 개인정보 / 국외이전 / 약관 3종 동의를 받지 않은 사용자는 서비스 진입 차단해야 함. 하지만 Next.js 미들웨어는 Edge 런타임이라 Prisma 직접 호출이 불가능.
- **Action**: Auth.js v5의 `jwt` 콜백을 Node-only 인스턴스(`auth.ts`)에서만 실행하도록 분리, DB의 동의 타임스탬프 3종을 읽어 `token.consentComplete` 불리언으로 JWT에 박음. Edge 미들웨어는 동일한 `auth.config.ts`로 JWT만 디코딩해 분기.
- **Result**: 미들웨어에서 DB 호출 0회로 보호 라우트 분기 가능(`/timeline`·`/consent` 무세션 접근 시 307→`/login` 검증). 에지 ↔ Node 코드 분리(`auth.config.ts` / `auth.ts`)는 Auth.js v5의 권장 패턴이지만, 콜백 일부만 Node에 두는 변형 설계로 동의 상태까지 에지에 노출.

## Next.js 16 deprecation 빠른 마이그레이션

- **Problem**: 라우트 보호용 `middleware.ts`를 작성했는데 보호된 경로가 무세션 상태에서도 200 응답. 미들웨어 자체가 실행되지 않는 상태.
- **Action**: matcher / 캐시 / 재시작 등 표면 원인을 차례로 배제한 뒤 dev 서버 stdout에서 deprecation 경고 1줄 발견(`The "middleware" file convention is deprecated. Please use "proxy" instead`).
- **Result**: 파일명 한 줄(`middleware.ts` → `proxy.ts`) 변경으로 5분 이내 종결. 메이저 버전 업그레이드 직후 dev 로그를 우선 확인하는 습관의 가치를 데이터로 확인.
