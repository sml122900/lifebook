# 결정 — 토스페이먼츠 테스트 모드 + 서버 측 금액 재검증

## Problem

Phase 8.5에서 토큰 충전(KRW → 서비스 토큰) 흐름을 닫아야 했다. 결제는 **출시 직전까지 mock 없이도 흐름 자체가 끝까지 동작**해야 추후 실제 청구로 전환하기 쉽고, 결제 보안 코드를 미리 검증할 수 있다. 동시에 절대 어겨선 안 되는 두 가지가 있었다:

1. **클라이언트가 보낸 금액을 신뢰하지 말 것**. 위변조된 amount(e.g. 100,000원 결제로 보이게 한 1,000원 결제)가 그대로 토큰 적립되면 즉시 회계 사고.
2. **시크릿 키는 절대 서버 밖으로 나가지 말 것**. 클라이언트 번들·URL 어디에도 노출 X.

또한 가입 직후 신규 사용자가 첫 결제를 시도해도 신뢰감 있게 흘러야 했다 (테스트 카드로 끝까지 → 충전 완료 화면).

## Action

**토스페이먼츠의 테스트 모드 + 4중 검증** 패턴을 채택했다.

### 4중 검증

| # | 위치 | 무엇을 |
|---|------|--------|
| 1 | `lib/tokens/toss.ts:59` Toss `/v1/payments/confirm` | Toss 측이 paymentKey + orderId + amount가 자기 record와 일치하는지 확인 |
| 2 | `lib/tokens/orders.ts:106` server amount 매칭 | `order.krw === confirmed.totalAmount` — 우리 server-side 두 값만 비교, URL 쿼리는 hint만 |
| 3 | `lib/tokens/orders.ts:86` userId scope | `order.userId !== userId`면 reject — 다른 사용자 order로 적립 불가 |
| 4 | `TokenOrder.paymentKey @unique` | 같은 paymentKey 두 번 적립 불가 (race 시 P2002로 한쪽 rollback) |

### 데이터 흐름

```
[Client]                          [Server]                       [Toss]
TopupButton ──packageId──> startTopup
                            ↓
                            TokenOrder.create (PENDING, krw from policy)
                            ↓
                            returns {orderId, krw, orderName}
                            ↓
loadTossPayments(clientKey)
.requestPayment({orderId, amount: krw, successUrl, failUrl})
                            ────────────────────────────────────>
                                                                 [user pays]
                                                                 redirect
<──── /billing/success?paymentKey=&orderId=&amount= ────────────
                            ↓
                            confirmTossPayment({paymentKey, orderId, amount})
                            ─────────────────────────────────────>
                                                                 [auth check]
                            <─── totalAmount, status ────────────
                            ↓
                            settleOrderAfterToss(userId, orderId, paymentKey, confirmed.totalAmount)
                            ↓ ($transaction)
                            order.krw === confirmed.totalAmount?
                            ↓ yes
                            wallet.balance += order.tokens
                            tx insert (reason=topup, refId=orderId)
                            order.status = paid + paymentKey
```

### 핵심 코드 패턴

- **server는 packageId만 받음** (`app/billing/actions.ts:10`). krw/tokens는 `policy.ts`의 `TOPUP_PACKAGES`에서 읽음. 클라이언트는 금액 결정 권한 0.
- **시크릿 키 격리**: `process.env.TOSS_SECRET_KEY`는 `lib/tokens/toss.ts`에서만 read. Client component 6개 어디서도 접근 없음. `NEXT_PUBLIC_` 접두사 미사용.
- **`paymentKey @unique`**: 토스가 같은 결제로 두 번 콜백해도 두 번째 settle은 P2002 rollback. Race condition에서도 적립 한 번만.
- **PENDING → PAID 라이프사이클**: order row가 결제 시작 시점에 생기고, 토스 confirm 통과 시 PAID. 실패 시 `markOrderFailed`로 FAILED. 잔존 PENDING은 향후 GC 대상 (후속 작업).

## Result

- `db/test-topup-settle.ts`에서 happy path / 같은 paymentKey 재시도 / amount mismatch 세 시나리오 모두 검증. mismatch 시 order=failed, balance 불변.
- 실제 토스 테스트 카드로 끝까지 흐름 동작 확인됨 — 충전 완료 화면 + 잔액 +100 + 거래 내역 +100 row 등장.
- **트레이드오프**:
  - PENDING 주문이 영원히 누적될 가능성 (사용자가 결제창 그냥 닫음). 운영용 GC 또는 lazy cleanup 필요 — 검토 2/6 #2로 기록.
  - `confirmed.status` 필드 검증 부재. 토스가 200 + 비정상 status 반환하는 spec은 없지만 보수 가드 가능 — 검토 2/6 #7.
  - signup_grant 우회 가능성 (검토 2/6 #6): wallet 없는 상태로 결제 도달 시 `upsert`의 `create:` 분기로 wallet 생성되지만 무료 30토큰 누락. 정상 흐름에선 jwt callback backstop으로 wallet 항상 존재라 거의 발생 안 함.
- **다음 작업과의 연결**: 실제 출시 시 client key를 production key로, secret key를 production secret로 바꾸고 successUrl/failUrl을 prod 도메인으로 교체. 코드 변경 0줄. PG사 추가 시(카카오페이/네이버페이) `confirmTossPayment` 같은 형태의 helper만 추가하면 됨.
