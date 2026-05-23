# 결정 — AI 토큰 차감 race condition을 PostgreSQL 조건부 UPDATE로 해결

## Problem

Phase 8.3에서 추억 1건당 토큰 차감 helper `settleConversationCharges`를 만들었다. 한 사이클(guided + summary)을 합산해 한 번에 `ceil((in+out)/N)`로 차감해 호출당 ceil 중복을 피하는 게 핵심이었다.

원래 구현은 `chargedAt: null`인 메시지를 SELECT → 합산 → wallet decrement → tx insert → chargedAt update를 한 `$transaction`에 묶었다. 직관적으로는 멱등해 보였지만, 검토 2/6 #10에서 race를 발견했다.

### Race 시나리오

사용자가 "추억 남기기" 버튼 더블 클릭 또는 네트워크 retry로 두 `submitMemoryAnswer`가 동시에 실행:

```
tx1: SELECT messages WHERE chargedAt IS NULL  → rows [A, B] (둘 다 보임)
tx2: SELECT messages WHERE chargedAt IS NULL  → rows [A, B] (tx1 commit 전이라 똑같이 보임)
tx1: cost = ceil((sum)/2000) = 1
tx2: cost = 1
tx1: UPDATE wallet SET balance = balance - 1
tx2: UPDATE wallet SET balance = balance - 1
tx1: INSERT tx
tx2: INSERT tx
tx1: UPDATE messages SET chargedAt = now WHERE id IN [A, B]
tx2: UPDATE messages SET chargedAt = now WHERE id IN [A, B] (덮어쓰기)
tx1: COMMIT
tx2: COMMIT
```

결과:
- wallet `balance -= 2` (잔액이 cost 미만이면 음수)
- TokenTransaction 2개 (중복 차감 ledger)
- 사용자 입장: 한 번 누른 답변에 토큰 2배 부과 + UserMemory 2개

PostgreSQL 기본 격리 수준(READ COMMITTED)에서는 SELECT가 다른 트랜잭션의 commit 안 된 변경을 못 본다. tx1의 chargedAt update가 commit되기 전 tx2가 SELECT하면 tx2는 여전히 chargedAt=null로 봄.

## Action

**한 `$transaction` 안에서 두 SQL을 raw로 작성 — 둘 다 row lock + WHERE 조건 재평가로 race를 단일 단계로 해결**.

### 핵심 SQL 1 — chargedAt 원자 claim

```sql
UPDATE "AIMessage"
SET "chargedAt" = NOW()
WHERE "conversationId" = $1
  AND role = 'assistant'::"AIMessageRole"
  AND "chargedAt" IS NULL
RETURNING id, "inputTokens", "outputTokens"
```

PostgreSQL의 UPDATE는 **target row에 row-level lock**을 잡는다. 동시 두 트랜잭션이 같은 row를 UPDATE 시도하면:

- tx1이 lock 획득 → WHERE 평가 → 조건 통과 → chargedAt = NOW 설정
- tx2는 lock 대기
- tx1 commit → lock 해제 → tx2의 UPDATE 재시작 → **WHERE를 다시 평가** → chargedAt이 이미 NOW (NOT NULL) → 조건 false → 0 rows

`RETURNING`이 tx2에 빈 결과를 주므로 race loser는 자연스럽게 `{ charged: false, reason: "no_usage" }` 반환.

### 핵심 SQL 2 — 잔액 음수 방지

```sql
UPDATE "TokenWallet"
SET balance = balance - $1, "updatedAt" = NOW()
WHERE "userId" = $2 AND balance >= $1
RETURNING balance
```

위 chargedAt 가드가 race를 잡지만, 만약 어떤 경로로 두 charge가 모두 통과한다면 (예: 두 다른 conversation의 동시 settle, 또는 외부 SQL 직접 실행) wallet 음수 가능. WHERE에 `balance >= $1`을 두면 잔액 부족 시 0 rows RETURNING → throw `InsufficientBalanceError` → `$transaction` rollback → chargedAt claim까지 모두 되돌림.

### Rollback의 의미

`$transaction` 안에서 throw하면 chargedAt update까지 모두 되돌아감. race loser가 wallet 부족으로 fail해도 chargedAt이 null로 되돌아오므로 **다음 정상 settle이 그 메시지를 다시 claim 가능**. 잃는 데이터 없음.

## Result

`db/test-charge-race.ts`로 검증:

```ts
const [r1, r2] = await Promise.all([
  settleConversationCharges(user.id, conv.id),
  settleConversationCharges(user.id, conv.id),
]);
```

기대 결과 (검증됨):
- 정확히 하나는 `{ charged: true, tokensSpent: 1, balanceAfter: 29 }`
- 다른 하나는 `{ charged: false, reason: "no_usage" }`
- wallet balance: 30 → **29** (한 번만 차감)
- reconcile match: true

기존 `db/test-charge.ts` (sequential)도 regression 없이 통과.

### 트레이드오프

- **Raw SQL 도입** — Prisma의 type-safe API보다 read 부담 증가. 대신 `RETURNING`과 row lock + WHERE 재평가는 Prisma `updateMany`로는 동등 표현 어려움(updateMany는 count만 반환, RETURNING은 raw 필요).
- **UserMemory row-level idempotency는 별개** — race 시 charge는 한 번만 되지만 UserMemory 자체는 두 row로 생성될 수 있음. 같은 폼 두 번 submit하면 추억 카드 두 개. 진짜 idempotency는 `idempotencyKey` 컬럼 추가 + form mount 시 UUID 박는 작업 필요. 후속 작업으로 미룸.
- **PostgreSQL 의존** — 다른 DBMS(MySQL 등)로 옮길 일 생기면 WHERE + RETURNING 패턴이 동일하게 작동하는지 검증 필요. SQLite는 RETURNING 지원하지만 일부 lock 동작 다를 수 있음.

### 일반화된 학습

레이스를 막는 방법은 셋:
1. **격리 수준 올리기** (SERIALIZABLE) — race 자동 감지하지만 성능 cost + retry 로직 필요
2. **명시 lock** (`SELECT FOR UPDATE`) — 비싸고 deadlock risk
3. **조건부 UPDATE + RETURNING** — 한 SQL이 lock + check + mutate를 atomically 처리

이번 케이스는 (3)이 가장 자연스러웠다. 핵심은 "한 SQL이 모든 검증과 변경을 한 atomic step에 끝내라"는 원칙. transaction 안에서 read → think → write로 나누면 read와 write 사이 race window 생김.
