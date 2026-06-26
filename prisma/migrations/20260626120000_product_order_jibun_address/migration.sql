-- 카카오 우편번호 연동 — 지번 주소 컬럼 추가(도로명 address1 과 함께 저장,
-- 인쇄소 발송용). 기존 주문은 NULL(무영향). 순수 ADD COLUMN.
ALTER TABLE "ProductOrder" ADD COLUMN "jibunAddress" TEXT;
