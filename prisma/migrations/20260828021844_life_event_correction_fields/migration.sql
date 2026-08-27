-- AlterTable
ALTER TABLE "LifeEvent" ADD COLUMN     "correctedLabel" TEXT,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unclearCount" INTEGER NOT NULL DEFAULT 0;

