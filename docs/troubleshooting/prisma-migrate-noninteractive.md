# 트러블슈팅 — Prisma migrate dev 가 비대화형 환경에서 차단됨

## 문제 상황

가족 반응 검토 픽스(M1)로 `MemoryReaction` 의 unique 를
`@@unique([targetType, targetId, authorId, stamp])` →
`@@unique([roomId, targetType, targetId, authorId, stamp])` 로 변경 후
마이그레이션 생성 시:

```
⚠️  Warnings for the current datasource:
  • A unique constraint covering the columns [roomId,...] on the table
    MemoryReaction will be added. If there are existing duplicate values,
    this will fail.

Error: Prisma Migrate has detected that the environment is non-interactive,
which is not supported.
`prisma migrate dev` is an interactive command...
```

`migrate dev` 가 데이터 손실 가능 경고(unique 추가 → 기존 중복 있으면
실패)에 y/n 확인을 요구하는데, Claude Code 의 Bash 는 비대화형(-NonInteractive)
이라 프롬프트에 답할 수 없어 통째로 거부.

(직전 마이그레이션 `add_family_reactions_feedseen` 은 순수 CREATE TABLE
이라 경고 없이 비대화형에서 통과했음 — 경고가 붙는 마이그레이션만 차단.)

## 시도한 것들

### 1. 그냥 재실행 — 동일 에러

비대화형 자체가 문제라 재시도 무의미.

### 2. `--create-only` 후 적용?

`migrate dev --create-only` 도 같은 dev 커맨드 계열이라 동일 프롬프트 위험.

### 3. 수동 마이그레이션 + `migrate deploy`

`migrate deploy` 는 **이미 만들어진** 마이그레이션을 비대화형으로 적용하는
배포용 커맨드 — 프롬프트 없음. 대상 테이블이 비어있음(테스트가 정리)을
확인했으니 unique 추가가 안전.

## 최종 해결법

1. 마이그레이션 폴더를 직접 생성:
   `prisma/migrations/20260528120000_reaction_unique_per_room/migration.sql`
   ```sql
   DROP INDEX "MemoryReaction_targetType_targetId_authorId_stamp_key";
   CREATE UNIQUE INDEX "MemoryReaction_roomId_targetType_targetId_authorId_stamp_key"
     ON "MemoryReaction"("roomId","targetType","targetId","authorId","stamp");
   ```
   (인덱스 이름은 직전 마이그레이션의 자동 생성 이름을 그대로 참고.)
2. `npx prisma migrate deploy` — 미적용 마이그레이션만 적용, 비대화형 OK.
3. `npx prisma generate` — **명시 실행**. (이번 케이스에선 generate 를
   따로 안 돌렸을 때 검증 스크립트에서 `prisma.memoryReaction` 가
   `undefined` → `Cannot read properties of undefined (reading 'create')`.
   migrate 계열이 generate 를 항상 보장하진 않으니 schema 변경 후엔
   generate 를 한 번 더 명시하는 게 안전.)

## 핵심 학습

1. **경고가 붙는 마이그레이션은 `migrate dev` 가 비대화형에서 막힌다.**
   순수 추가(CREATE TABLE)는 통과하지만, unique/NOT NULL 추가처럼 데이터
   손실 가능성이 있으면 확인 프롬프트 → 비대화형 거부.
2. **회피: 수동 migration.sql + `migrate deploy`.** deploy 는 생성이 아닌
   적용이라 프롬프트가 없다. 테이블이 비었음을 먼저 확인(안전).
3. **schema 변경 후 `prisma generate` 명시.** 안 하면 새 모델/필드가
   클라이언트에 없어 런타임 `undefined`. (dev 서버는 추가로 재시작 필요 —
   `prisma-7-dev-client-cache.md` 참조.)
4. **인덱스 이름 규칙**: Prisma 자동 이름 = `{Table}_{col1}_{col2}_..._key`.
   수동 DROP/CREATE 시 직전 마이그레이션에서 실제 이름을 확인해 맞춘다.

## 이력서 소재 한 줄

Prisma `migrate dev` 가 unique 추가 경고로 비대화형 CI/에이전트 환경에서
차단되는 문제를, 수동 migration.sql + `migrate deploy`(+명시 generate)로
우회하는 안전 절차를 정립.
