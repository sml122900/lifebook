-- CreateEnum
CREATE TYPE "LifeEventStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'SKIPPED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "LifeEventType" AS ENUM ('BIRTH', 'ELEM_SCHOOL', 'MIDDLE_SCHOOL', 'HIGH_SCHOOL', 'UNIVERSITY', 'MILITARY', 'FIRST_JOB', 'MARRIAGE', 'CUSTOM');

-- CreateTable
CREATE TABLE "LifeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LifeEventType" NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "status" "LifeEventStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "sequenceOrder" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "correctedYear" INTEGER,
    "hasEpisode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "lifeEventId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rawTranscript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "birthMonth" INTEGER,
    "gender" TEXT,
    "region" TEXT NOT NULL,
    "skeletonGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifeEvent_userId_sequenceOrder_idx" ON "LifeEvent"("userId", "sequenceOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProfile_userId_key" ON "OnboardingProfile"("userId");

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES "LifeEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

