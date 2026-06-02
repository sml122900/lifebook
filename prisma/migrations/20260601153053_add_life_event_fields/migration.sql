-- CreateEnum
CREATE TYPE "EventPrecision" AS ENUM ('EXACT', 'APPROXIMATE');

-- CreateEnum
CREATE TYPE "LifeCategory" AS ENUM ('BIRTH', 'CHILDHOOD', 'SCHOOL', 'MILITARY', 'WORK', 'RELATIONSHIP', 'FAMILY', 'RESIDENCE', 'OTHER');

-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "category" "LifeCategory",
ADD COLUMN     "eventMonth" INTEGER,
ADD COLUMN     "eventTitle" TEXT,
ADD COLUMN     "eventYear" INTEGER,
ADD COLUMN     "precision" "EventPrecision";

-- CreateIndex
CREATE INDEX "UserMemory_userId_eventYear_eventMonth_idx" ON "UserMemory"("userId", "eventYear", "eventMonth");
