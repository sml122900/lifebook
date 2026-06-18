-- Phase 8 — Person.subjectType 추가.
-- 이야기 주체를 인물("person") 외 장소("location")·물건("thing") 으로 확장.
-- 기존 행은 모두 DEFAULT 'person' — 무영향.
-- geo 장소(UserMemory.placeName/lat/lng) 와 완전히 별개 테이블/컬럼.

ALTER TABLE "Person" ADD COLUMN "subjectType" TEXT NOT NULL DEFAULT 'person';

CREATE INDEX "Person_userId_subjectType_idx" ON "Person"("userId", "subjectType");
