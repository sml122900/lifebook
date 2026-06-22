-- Phase 10 Phase 2 — 통녹음 분할 부모 참조.
--
-- free_recording 1행(원본)과 N개 life_event(세그먼트)를 잇는 자기참조 FK.
-- SetNull: 원본 삭제 시 세그먼트의 parentMemoryId 가 null 로 남고 세그먼트 생존.
-- 기존 행은 전부 null — 무영향.

ALTER TABLE "UserMemory" ADD COLUMN "parentMemoryId" TEXT;

ALTER TABLE "UserMemory"
  ADD CONSTRAINT "UserMemory_parentMemoryId_fkey"
  FOREIGN KEY ("parentMemoryId") REFERENCES "UserMemory"("id") ON DELETE SET NULL;

CREATE INDEX "UserMemory_parentMemoryId_idx" ON "UserMemory"("parentMemoryId");
