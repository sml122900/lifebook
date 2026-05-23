# 결정 — Prisma 7 + driver adapter (`@prisma/adapter-pg`)

## Problem

PostgreSQL을 쓰면서, 향후 pgvector 임베딩 컬럼까지 같은 ORM에서 다루고 싶다. 타입 안전한 모델 정의 + 마이그레이션 도구가 필요했고, 차세대(driver adapter) 흐름을 처음부터 따라가서 미래의 마이그레이션 부담을 줄이고 싶었다.

## Action

Prisma 7.8 + `@prisma/adapter-pg` + `pg` 드라이버 어댑터 패턴을 채택했다.

- 스키마 generator는 새 형식 `provider = "prisma-client"`, 출력은 `lib/generated/prisma/`
- 런타임 클라이언트는 driver adapter를 통해 생성:
  ```ts
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
  ```
- `lib/db.ts` 싱글톤 (HMR-safe global cache)
- `prisma.config.ts`에서 CLI용 datasource URL 별도 관리

## Result

- `db/ping.ts`의 `SELECT 1` 정상 응답 → 앱 ↔ DB 통로 확보
- `@auth/prisma-adapter`(Auth.js)와도 타입 호환되어 추가 설정 없이 연동
- 트레이드오프:
  - 클래식 `datasources: { db: { url } }` / `datasourceUrl` 단축 옵션이 모두 제거됨. 모든 환경에서 adapter 인스턴스화 필요(에지 런타임에서는 부적합).
  - `migrate dev` 후 `prisma generate`가 자동으로 안 도는 경우가 있음 → 시드/리로드 전에 수동 호출 필요.
- pgvector 컬럼은 Phase 6에서 임베딩 모델 선정 후 raw SQL로 ALTER 추가 예정.
