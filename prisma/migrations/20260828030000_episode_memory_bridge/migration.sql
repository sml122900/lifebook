-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "memoryId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Episode_memoryId_key" ON "Episode"("memoryId");

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "UserMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
