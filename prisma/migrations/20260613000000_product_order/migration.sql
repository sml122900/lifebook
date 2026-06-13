-- CreateEnum
CREATE TYPE "ProductOrderStatus" AS ENUM ('pending', 'paid', 'preparing', 'shipped', 'delivered', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "ProductOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT NOT NULL,
    "optionId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitKrw" INTEGER NOT NULL,
    "shippingKrw" INTEGER NOT NULL DEFAULT 0,
    "totalKrw" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "postalCode" TEXT,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "deliveryMemo" TEXT,
    "status" "ProductOrderStatus" NOT NULL DEFAULT 'pending',
    "paymentKey" TEXT,
    "approvedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "trackingCarrier" TEXT,
    "trackingNumber" TEXT,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductOrder_paymentKey_key" ON "ProductOrder"("paymentKey");

-- CreateIndex
CREATE INDEX "ProductOrder_userId_idx" ON "ProductOrder"("userId");

-- CreateIndex
CREATE INDEX "ProductOrder_status_idx" ON "ProductOrder"("status");

-- AddForeignKey
ALTER TABLE "ProductOrder" ADD CONSTRAINT "ProductOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
