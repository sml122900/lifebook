-- CreateTable
CREATE TABLE "SharedMemory" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "createdById" TEXT NOT NULL,
    "lastEditedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedMemory_roomId_year_idx" ON "SharedMemory"("roomId", "year");

-- AddForeignKey
ALTER TABLE "SharedMemory" ADD CONSTRAINT "SharedMemory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SharedRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedMemory" ADD CONSTRAINT "SharedMemory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedMemory" ADD CONSTRAINT "SharedMemory_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
