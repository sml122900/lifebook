-- P9-1 — period(구간) 대화 Episode 판별 플래그.
-- 순수 ADD COLUMN, 기존 행은 모두 false(= 이벤트 자체 이야기, 기존 동작과 동일).
ALTER TABLE "Episode" ADD COLUMN "isPeriod" BOOLEAN NOT NULL DEFAULT false;
