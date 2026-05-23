-- CreateEnum
CREATE TYPE "TokenOrderStatus" AS ENUM ('pending', 'paid', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "TokenOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "krw" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL,
    "status" "TokenOrderStatus" NOT NULL DEFAULT 'pending',
    "paymentKey" TEXT,
    "approvedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenOrder_paymentKey_key" ON "TokenOrder"("paymentKey");

-- CreateIndex
CREATE INDEX "TokenOrder_userId_idx" ON "TokenOrder"("userId");

-- AddForeignKey
ALTER TABLE "TokenOrder" ADD CONSTRAINT "TokenOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
