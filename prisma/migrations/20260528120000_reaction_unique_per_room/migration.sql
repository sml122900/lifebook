-- 반응을 룸별로 분리 (M1): unique 키에 roomId 포함.
-- 같은 추억이 여러 룸에 보여도 룸마다 독립 반응 — 저장/조회 기준 일치.

-- DropIndex
DROP INDEX "MemoryReaction_targetType_targetId_authorId_stamp_key";

-- CreateIndex
CREATE UNIQUE INDEX "MemoryReaction_roomId_targetType_targetId_authorId_stamp_key" ON "MemoryReaction"("roomId", "targetType", "targetId", "authorId", "stamp");
