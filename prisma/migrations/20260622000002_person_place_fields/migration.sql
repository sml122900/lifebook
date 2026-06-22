-- Person 장소 좌표 필드 추가 (location subjectType 전용)
-- 기존 행 모두 null 무영향.

ALTER TABLE "Person" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Person" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Person" ADD COLUMN "placeAddress" TEXT;
ALTER TABLE "Person" ADD COLUMN "placeSource" TEXT;
