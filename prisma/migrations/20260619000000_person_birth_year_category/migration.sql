-- Person 출생년도 + 카테고리 추가
-- nullable 컬럼 — 기존 행 안전 (DEFAULT 없음)
ALTER TABLE "Person" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "Person" ADD COLUMN "category" TEXT;
