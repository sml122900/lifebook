-- CreateEnum
CREATE TYPE "OnboardingTrack" AS ENUM ('V2', 'V3');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingTrack" "OnboardingTrack" NOT NULL DEFAULT 'V2';
