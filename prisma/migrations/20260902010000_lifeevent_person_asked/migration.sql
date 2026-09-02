-- P8-4 — person 갭(gap-detector) 재노출 방지용 플래그.
-- 순수 ADD COLUMN, 기존 행은 모두 false(= 아직 안 물어봄, 기존 동작과 동일).
ALTER TABLE "LifeEvent" ADD COLUMN "personAsked" BOOLEAN NOT NULL DEFAULT false;
