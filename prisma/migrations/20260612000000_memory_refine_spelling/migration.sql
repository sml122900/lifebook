-- 문장 다듬기 MVP (맞춤법만) — UserMemory 에 3컬럼 추가.
-- 원문(content) 영구 보존, refinedText 는 AI 교정본 별도 저장.
-- 기존 행은 모두 NULL / false — 무영향.
ALTER TABLE "UserMemory" ADD COLUMN "refinedText" TEXT;
ALTER TABLE "UserMemory" ADD COLUMN "refinedAt" TIMESTAMP(3);
ALTER TABLE "UserMemory" ADD COLUMN "displayRefined" BOOLEAN NOT NULL DEFAULT false;
