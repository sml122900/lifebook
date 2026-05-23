# 트러블슈팅 — Prisma 7의 PrismaClient 생성 옵션 변경

## 문제 상황

Phase 0.6에서 `lib/db.ts` 작성 후 `npx tsx db/ping.ts`로 첫 DB 핑을 시도. 다음 에러로 실패:

```
PrismaClientInitializationError: `PrismaClient` needs to be constructed
with a non-empty, valid `PrismaClientOptions`
```

schema.prisma의 `datasource db`에 `url`을 두지 않았더니(Prisma 7의 새 컨벤션은 `prisma.config.ts`에서 datasource URL을 잡음) 런타임 생성자가 옵션 없이 호출되지 못하는 상황.

## 시도한 것들

1. `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })`
   → `PrismaClientConstructorValidationError: Unknown property datasourceUrl provided to PrismaClient constructor`
2. `new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })`
   → `Unknown property datasources provided to PrismaClient constructor`
3. 생성된 `lib/generated/prisma/internal/prismaNamespace.ts`의 `PrismaClientOptions` 타입을 직접 확인 → 유니온 타입의 한쪽은 `adapter: SqlDriverAdapterFactory`, 다른 쪽은 `accelerateUrl: string`. **클래식 옵션이 전부 사라짐.**

## 최종 해결법

Prisma 7은 런타임 클라이언트에서 driver adapter를 필수로 요구한다. `@prisma/adapter-pg` + `pg`를 설치하고 `PrismaPg` 인스턴스를 PrismaClient에 주입.

```bash
npm i @prisma/adapter-pg pg
npm i -D @types/pg
```

```ts
// lib/db.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}
```

이후 `npx tsx db/ping.ts` → `DB OK: [ { ok: 1 } ]` 정상 출력.

## 이력서 소재 한 줄

Prisma 메이저 버전 업그레이드에서 deprecated된 클라이언트 옵션을 단계적으로 시도하며 공식 타입 정의를 역추적, driver adapter 패턴(`@prisma/adapter-pg`)으로 마이그레이션해 데이터 액세스 레이어를 정상화.
