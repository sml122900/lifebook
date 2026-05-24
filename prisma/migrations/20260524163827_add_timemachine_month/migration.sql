-- CreateTable
CREATE TABLE "TimemachineMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "monthStory" TEXT NOT NULL DEFAULT '',
    "keptEvents" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimemachineMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimemachineMonth_userId_idx" ON "TimemachineMonth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimemachineMonth_userId_year_month_key" ON "TimemachineMonth"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "TimemachineMonth" ADD CONSTRAINT "TimemachineMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
