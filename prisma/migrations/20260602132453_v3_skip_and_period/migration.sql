-- AlterTable
ALTER TABLE "User" ADD COLUMN     "skippedLifeCategories" "LifeCategory"[] DEFAULT ARRAY[]::"LifeCategory"[];

-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "endYear" INTEGER;
