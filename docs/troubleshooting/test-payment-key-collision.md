# 트러블슈팅 — 결제 회귀 테스트가 재실행 시 P2002로 깨짐

## 문제 상황

배포 전 코드리뷰에서 `db/test-topup-settle.ts`(토큰 결제 정산 회귀)가 **step 1부터 실패**했다.

```
Invalid `tx.tokenOrder.update()` invocation ... lib/tokens/orders.ts:133
Unique constraint failed on the fields: (`paymentKey`)   code: P2002
```

같은 날 오전엔 통과했던 테스트가, 코드 변경 없이 재실행하자 깨졌다. settle 로직 자체는 보안 리뷰에서 정상으로 확인된 상태라 "프로덕션 버그인가?" 가 첫 의심이었다.

## 시도한 것들

1. **에러 전문 확보** — `update` 대상이 `paymentKey "pk-1"` 충돌. 테스트는 `pk-1`/`pk-2`/`pk-4` **고정 문자열**을 paymentKey로 쓰고 있었다.
2. **테스트 격리 추적** — 테스트는 `finally`에서 throwaway user를 `delete`한다. 그런데 `TokenOrder.userId`는 `onDelete: SetNull`(전상법 5년 보존 정책) → **user를 지워도 TokenOrder 행은 userId=null로 살아남는다.**
3. **연결** — `TokenOrder.paymentKey @unique`는 **전역**이다. 오전 통과 run이 `pk-1`/`pk-4` 행을 paid로 남겼고(userId만 null), 오후 재실행이 같은 `pk-1`로 settle하려다 P2002.
4. **프로덕션 영향 확인** — 운영 paymentKey는 토스가 결제마다 유니크 발급 → 이 충돌은 프로덕션에 발생 불가. **테스트 격리 결함이지 결제 버그가 아님**을 확정.

## 최종 해결법

테스트를 매 실행 고유 + self-cleanup으로 고쳤다 (`db/test-topup-settle.ts`):

- 고정 키 → `pk-${user.id}-N` (cuid 기반, 실행마다 유일). 단 idempotency를 검증하는 step 1·2는 **같은 키**를 유지해야 하므로 `pk1` 변수를 공유.
- `finally`에서 user 삭제 *전에* `tokenOrder.deleteMany({ where: { userId } })` — SetNull로 남는 orphan을 원천 차단.

운영 Supabase에 이미 쌓인 orphan 2행(`pk-1`/`pk-4`, userId=null)은 **SELECT로 보여주고 사용자가 직접 DELETE**(운영 DB 삭제는 리뷰 후 직접 수행 수칙). 식별 시그니처: `paymentKey IN ('pk-1','pk-2','pk-4') AND userId IS NULL`(실제 결제 키는 이 형태일 수 없어 안전).

## 교훈

`onDelete: SetNull`로 법적 보존하는 테이블은 **테스트 throwaway가 user만 지워선 안 된다** — 보존되는 자식 행이 전역 unique 제약과 충돌해 다음 실행을 깨뜨린다. 보존 정책과 테스트 격리는 같이 설계해야 한다.

## 이력서 한 줄

결제 회귀 테스트의 간헐적 P2002 실패를 "법적 5년 보존(SetNull)" 정책과 "전역 unique paymentKey"의 상호작용으로 진단 — 프로덕션 무결함을 입증하고 테스트를 실행별 유니크 키 + self-cleanup으로 격리.
