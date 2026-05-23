# Phase 1 — 데이터 모델 & 앵커 이벤트 시드

> **목표**: 핵심 데이터 모델(User / LifeProfile / Event / UserMemory)을 정의하고,
> 검증된 앵커 이벤트 ~30개를 DB에 적재한다. (이후 모든 화면이 이 데이터 위에 올라간다)
> **선행 조건**: Phase 0 완료 (Next.js 앱 + Postgres/pgvector + Prisma 연결 확인됨).
> **작업 방식**: 0.x와 동일 — 1.1부터 하나씩, 완료 기준 충족 시 커밋 후 다음.

---

## 1.1 — Prisma 스키마 정의 (핵심 4개 모델)

**목적**: MVP의 뼈대가 되는 모델을 정의한다. (공유룸·토큰·AI 대화 모델은 각 Phase에서 추가)

**작업**: `prisma/schema.prisma`에 아래를 작성한다.

```prisma
enum EventTier     { verified suggested }
enum EventCategory { anchor trigger }

model User {
  id        String        @id @default(cuid())
  email     String        @unique
  birthYear Int?
  region    String?
  createdAt DateTime      @default(now())
  profile   LifeProfile?
  memories  UserMemory[]
}

model LifeProfile {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id])
  schools      String[]
  residences   String[]
  parentsInfo  String?
  siblings     String?
  closeFriends String[]  // 별명/이니셜 권장 (개인정보 최소화)
  hobbies      String[]
  favMovies    String[]
  favGames     String[]
  favMusic     String[]
  updatedAt    DateTime @updatedAt
}

model Event {
  id          String        @id @default(cuid())
  year        Int
  month       Int?          // 월 단위 (없으면 연 단위)
  title       String
  description String?
  tier        EventTier     // anchor=verified
  category    EventCategory
  domain      String        // world|kr_politics|kr_society|disaster|sports|tech|culture|economy
  region      String        @default("KR")
  sourceName  String?
  sourceUrl   String?
  createdAt   DateTime      @default(now())
  memories    UserMemory[]
  @@index([year])
}

model UserMemory {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  eventId    String?
  event      Event?   @relation(fields: [eventId], references: [id])
  year       Int
  month      Int?
  title      String
  content    String?
  createdVia String   @default("manual") // manual | ai_chat
  createdAt  DateTime @default(now())
  @@index([userId])
}
```

**완료 기준**: 스키마 파일이 위 4개 모델 + 2개 enum을 포함하고 `npx prisma validate`가 통과한다.

---

## 1.2 — 마이그레이션 생성·적용

**작업**: `npx prisma migrate dev --name init_core_models` 실행 후 `npx prisma generate`.

**완료 기준**: DB에 `User`, `LifeProfile`, `Event`, `UserMemory` 테이블이 생성된다. (`npx prisma studio`로 확인)

---

## 1.3 — (선택) embedding 컬럼 자리 마련

**목적**: Phase 6의 RAG를 위해 pgvector 컬럼을 미리 둘 수 있다. **지금 안 하고 Phase 6에서 해도 무방.**

**작업(원할 경우만)**: 마이그레이션에 raw SQL로 추가.
```sql
ALTER TABLE "Event" ADD COLUMN embedding vector(1536);
```
(차원 수는 사용할 임베딩 모델에 맞춰 Phase 6에서 확정. 지금은 nullable, 값 비움.)

**완료 기준**: 컬럼이 추가되거나, "Phase 6에서 추가" 결정이 메모로 남는다.

---

## 1.4 — 앵커 이벤트 시드 데이터 작성

**목적**: 검증된 큰 사건을 DB에 넣어 타임라인의 기준점을 만든다.

**작업**
- `docs/앵커이벤트_초안.md`(또는 별도 전달본)의 목록을 `db/seed/anchorEvents.ts`(또는 `.json`)로 옮긴다.
- 각 항목: `year, month?, title, description, domain`, `tier="verified"`, `category="anchor"`, `region="KR"`(세계 사건은 `"GLOBAL"`).
- ⚠️ **모든 날짜는 적재 전 한 번 더 확인**한다 (앵커는 100% 정확이 원칙). 최근 항목(2024~2025)은 초안에 출처가 달려 있다.

**완료 기준**: 시드 데이터 파일에 ~30개 항목이 구조화되어 있다.

---

## 1.5 — 시드 스크립트 작성·실행

**작업**
- `db/seed.ts`: 위 데이터를 `prisma.event.createMany`로 적재 (중복 방지: 재실행 시 기존 anchor 삭제 후 삽입하거나 `skipDuplicates`).
- `package.json`에 `"db:seed": "tsx db/seed.ts"` 추가.
- 실행: `npm run db:seed`.

**완료 기준**: 실행 시 "N개 앵커 이벤트 적재 완료" 로그가 뜨고, 재실행해도 중복이 쌓이지 않는다.

---

## 1.6 — 조회 확인

**작업**: 임시 스크립트 또는 Prisma Studio로 연도순 조회.
```ts
const events = await prisma.event.findMany({
  where: { category: "anchor" },
  orderBy: [{ year: "asc" }, { month: "asc" }],
});
```

**완료 기준**: 앵커 이벤트가 연도순으로 정렬되어 출력된다. (Phase 2 타임라인이 이 쿼리를 그대로 쓴다)

---

## ✅ Phase 1 체크포인트

- [ ] 4개 모델 + 2개 enum 스키마 정의, `prisma validate` 통과
- [ ] 마이그레이션 적용, 테이블 4개 생성
- [ ] 앵커 이벤트 ~30개 DB 적재 (날짜 재확인 완료)
- [ ] 연도순 조회 동작
- [ ] 의미 단위 커밋 완료

---

## 커밋 가이드 (예시)
- `feat: define core prisma models (user, profile, event, memory)`
- `feat: migrate core models`
- `feat: add anchor event seed data`
- `feat: add seed script and load anchor events`

## 다음 단계
Phase 1 완료 후 `phase2.md`(타임라인 정적 렌더 — 첫 보이는 화면)로 진행한다.
