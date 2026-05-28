-- CreateTable
CREATE TABLE "MemoryReaction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "stamp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyFeedSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reactionsSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordsSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyFeedSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryReaction_roomId_targetType_targetId_idx" ON "MemoryReaction"("roomId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "MemoryReaction_authorId_idx" ON "MemoryReaction"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryReaction_targetType_targetId_authorId_stamp_key" ON "MemoryReaction"("targetType", "targetId", "authorId", "stamp");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyFeedSeen_userId_key" ON "FamilyFeedSeen"("userId");

-- AddForeignKey
ALTER TABLE "MemoryReaction" ADD CONSTRAINT "MemoryReaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SharedRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryReaction" ADD CONSTRAINT "MemoryReaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyFeedSeen" ADD CONSTRAINT "FamilyFeedSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
