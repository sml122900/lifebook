-- Phase Photo (4단계+) — 기간 이벤트 시작/끝 점에 사진 배치 구분.
-- 기간 이벤트(학교/군대/직장)는 타임라인에서 시작·끝 두 점으로 split 되는데,
-- 사진은 memoryId 한곳에 붙어 양쪽에 같은 썸네일이 복제돼 보였다. periodAnchor
-- 로 어느 점에 띄울지 구분한다("both"=양쪽 / "start"=시작 / "end"=끝).
--
-- NOT NULL DEFAULT 'both' — 기존 사진은 자동으로 'both'(현재 동작 보존).
-- 별도 백필 불필요.
ALTER TABLE "Photo" ADD COLUMN "periodAnchor" TEXT NOT NULL DEFAULT 'both';
