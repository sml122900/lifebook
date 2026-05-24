-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "monthEventId" TEXT;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_monthEventId_fkey" FOREIGN KEY ("monthEventId") REFERENCES "MonthEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
