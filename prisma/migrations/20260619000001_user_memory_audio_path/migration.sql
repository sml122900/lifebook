-- Phase 7b: 음성 녹음 저장 경로 (recordings 버킷)
-- AddColumn
ALTER TABLE "UserMemory" ADD COLUMN "audioPath" TEXT;
