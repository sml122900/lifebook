-- CreateTable
CREATE TABLE "UserAttendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,
    "bonusToken" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAttendance_userId_date_idx" ON "UserAttendance"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserAttendance_userId_date_key" ON "UserAttendance"("userId", "date");

-- AddForeignKey
ALTER TABLE "UserAttendance" ADD CONSTRAINT "UserAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
