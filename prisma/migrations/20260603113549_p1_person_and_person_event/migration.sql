-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "metYear" INTEGER,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "PersonEvent_userId_idx" ON "PersonEvent"("userId");

-- CreateIndex
CREATE INDEX "PersonEvent_memoryId_idx" ON "PersonEvent"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonEvent_personId_memoryId_key" ON "PersonEvent"("personId", "memoryId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "UserMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
