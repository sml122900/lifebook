-- CreateEnum
CREATE TYPE "TriggerResponseStatus" AS ENUM ('confirmed', 'dismissed');

-- CreateTable
CREATE TABLE "TriggerResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "TriggerResponseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriggerResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TriggerResponse_userId_idx" ON "TriggerResponse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TriggerResponse_userId_eventId_key" ON "TriggerResponse"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "TriggerResponse" ADD CONSTRAINT "TriggerResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerResponse" ADD CONSTRAINT "TriggerResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
