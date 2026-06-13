# 결정 — 실물 상품 판매: ProductOrder 분리 + 토큰 결제 인프라 재사용

## Problem

화면 속 인생 기록을 **실물 상품(포스터·부적·자서전 책)**으로 파는 커머스를 붙여야 했다. 이미 Phase 8.5에서 토큰 충전(KRW → 서비스 토큰) 결제가 토스 테스트 모드 + 4중 검증으로 완성돼 있었다. 두 가지를 동시에 만족해야 했다:

1. **결제 보안을 다시 짜지 말 것** — 토큰 결제의 "서버가 금액 진실 원천 + confirm + paymentKey idempotent" 불변식을 그대로 가져와야 한다. 커머스는 돈이라 보안 재구현은 회귀 위험.
2. **그러나 토큰 주문과 상품 주문은 결제 *이후*가 다르다** — 토큰은 결제 → 잔액 적립으로 끝. 상품은 결제 → 배송지 저장 → 주문 상태(접수→준비→발송→배송완료)가 이어지고 잔액은 안 늘어난다.

핵심 질문: 기존 `TokenOrder`/`settleOrderAfterToss`를 분기해 재사용할 것인가, 별도 모델을 둘 것인가?

## Action

**별도 `ProductOrder` 모델 + 결제 *플러밍*만 공용 재사용**으로 결정했다.

### 분리한 것 (도메인이 다름)
- `ProductOrder` 모델 (마이그 `20260613000000_product_order`) — `tokens` 대신 배송지 스냅샷 + 배송 이행 상태.
- `settleProductOrder` — `settleOrderAfterToss`와 같은 불변식이지만 부수효과가 "잔액 적립"이 아니라 "status=paid 기록"뿐.
- `ProductOrderStatus` enum — `pending/paid/preparing/shipped/delivered/failed/canceled`. 토큰(`pending/paid/failed/canceled`)보다 배송 단계가 더 많다.

### 공용 재사용한 것 (도메인 무관)
- `confirmTossPayment` (`lib/tokens/toss.ts`) — paymentKey+orderId+amount를 토스로 확인. 토큰·상품이 같은 함수를 호출.
- TopupButton/success 페이지 **패턴** — `requestPayment` → `confirm` → `settle` → 금액 대조 + paymentKey idempotent + success 재방문 가드(`findSettledProductOrder`).

### 왜 한 테이블에 nullable로 안 합쳤나
- 토큰 주문은 `paid`에서 종료, 상품은 그 뒤로 배송 상태가 계속 — status enum을 합치면 도메인이 섞여 불변식이 흐려진다.
- settle 부수효과가 정반대(적립 vs 미적립) → 한 함수에 분기하면 "잔액을 안 건드려야 하는데 건드리는" 회귀 위험.
- 필수 필드가 다름(tokens vs 배송지·상품·수량). nullable 범벅은 "어떤 게 진짜 필수인지" 모호.
- DRY는 **`confirmTossPayment` 레이어에서 이미 확보** — 보안 핵심은 공용, 도메인 로직만 분리.

### 보안 불변식 (토큰과 동일하게 복제)
| # | 위치 | 무엇을 |
|---|------|--------|
| 1 | `confirmTossPayment` | 토스가 paymentKey+orderId+amount 일치 확인 |
| 2 | `settleProductOrder` `order.totalKrw === tossAmount` | 서버 금액만 비교, URL `amount`는 confirm 입력 hint |
| 3 | `order.userId === session userId` | 남의 orderId로 정산 불가(IDOR 차단) |
| 4 | `ProductOrder.paymentKey @unique` | 같은 결제 두 번 정산 불가 |

### 가격/배송비 — 서버 스냅샷
- 카탈로그는 상수 `lib/commerce/products.ts`(TOPUP_PACKAGES 패턴). 클라는 `productId`+배송지만 전송.
- `computeOrderAmount`가 `unitKrw`(단가 스냅샷) + `shippingKrw`(균일 3,000 스냅샷) + `totalKrw` 계산. 주문 표시는 "상품 + 배송" 분리, 토스 결제는 `totalKrw`.

### 배송지 = 주문별 스냅샷
- `User`에 구조화 주소 없음 + 주문 시점 배송지가 법적 발송 기록 → `ProductOrder`에 인라인 저장.

## Result

- 신규 코드 ~900줄, **결제 보안 재구현 0**(confirm 공용). 마이그 1건 순수 ADD(기존 테이블 0 영향).
- 전상법 5년 보존: paid 이후(`paid/preparing/shipped/delivered`)는 `userId` nullable+SetNull로 탈퇴 시 자동 익명화 보존, `pending/failed/canceled`는 탈퇴 액션에서 deleteMany — TokenOrder와 동일 정책.
- v1 수량 1 고정(스키마는 `quantity` 보유), 옵션은 `optionId` 컬럼으로 출시 후 확장 여지.
- 6/19 부모님 테스트 대비 "테스트 결제 — 실제 청구·배송 안 됨" 상시 배너 + success "실제 배송 안 돼요" 이중 안내.

## 대안

- **TokenOrder 확장(nullable 컬럼)**: 마이그 가벼움. 하지만 settle 분기·status 혼합으로 회계 회귀 위험 → 기각.
- **DB `Product` 테이블**: 재고/관리자 편집/다수 상품 생기면 필요. v1은 3종 단일가라 상수로 충분(YAGNI) → 출시 후 승격.

## 후속
- `/account/orders` 주문·배송 상태 조회 / 관리자 발송 상태 변경 UI(현재 preparing 이후는 수동, enum만 보유).
- 옵션(포스터 연혁형·A1) `optionId` 확장.
- 청약철회(전상법 7일) — 배송 완료 상품 환불 정책(토큰 환불보다 복잡).
- 비로그인 마케팅 방문자에게도 보이는 "테스트 결제" 배너 노출 정책(출시 시 로그인 사용자 한정 등).
