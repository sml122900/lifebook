-- 무통장입금(계좌이체) 결제수단 추가.
--   - ProductOrderStatus 에 awaiting_payment(입금대기) 상태 추가.
--   - ProductOrder.paymentMethod 컬럼 추가(기존 주문은 "card").
-- ADD VALUE 는 같은 트랜잭션에서 *사용*만 안 하면 PG12+ 에서 안전(여기선 추가만).
ALTER TYPE "ProductOrderStatus" ADD VALUE 'awaiting_payment';

ALTER TABLE "ProductOrder" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'card';
