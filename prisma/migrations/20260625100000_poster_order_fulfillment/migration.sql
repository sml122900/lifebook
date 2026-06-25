-- P7-b — ProductOrder 확장(포스터 실물 주문 발주·환불·스냅샷).
-- 기존 데이터 무영향(전부 nullable/기본값). enum 값 1개 추가.

-- 환불 상태 추가(발주 전 환불).
ALTER TYPE "ProductOrderStatus" ADD VALUE IF NOT EXISTS 'refunded';

-- 결제 라이브 여부(false=테스트모드) + 포스터 스냅샷 + 환불 필드.
ALTER TABLE "ProductOrder" ADD COLUMN "paymentLive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductOrder" ADD COLUMN "posterSnapshot" JSONB;
ALTER TABLE "ProductOrder" ADD COLUMN "refundRequestedAt" TIMESTAMP(3);
ALTER TABLE "ProductOrder" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "ProductOrder" ADD COLUMN "refundReason" TEXT;
