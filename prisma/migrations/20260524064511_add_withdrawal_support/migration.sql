-- DropForeignKey
ALTER TABLE "LifeProfile" DROP CONSTRAINT "LifeProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "SharedMemory" DROP CONSTRAINT "SharedMemory_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TokenOrder" DROP CONSTRAINT "TokenOrder_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserMemory" DROP CONSTRAINT "UserMemory_userId_fkey";

-- AlterTable
ALTER TABLE "SharedMemory" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TokenOrder" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LifeProfile" ADD CONSTRAINT "LifeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedMemory" ADD CONSTRAINT "SharedMemory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenOrder" ADD CONSTRAINT "TokenOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
