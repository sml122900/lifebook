-- CreateEnum
CREATE TYPE "EventSection" AS ENUM ('POLITICS_SOCIETY', 'CULTURE', 'SPORTS', 'TREND');

-- CreateEnum
CREATE TYPE "EventTag" AS ENUM ('LIFESTYLE', 'YOUTH');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('VERIFIED', 'APPROX');

-- CreateEnum
CREATE TYPE "SongOrigin" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateTable
CREATE TABLE "MonthEvent" (
    "id" TEXT NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "section" "EventSection" NOT NULL,
    "tag" "EventTag",
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "eventDate" TEXT,
    "isPeriod" BOOLEAN NOT NULL DEFAULT false,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "confidence" "Confidence" NOT NULL DEFAULT 'APPROX',
    "source" TEXT,

    CONSTRAINT "MonthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartSong" (
    "id" TEXT NOT NULL,
    "origin" "SongOrigin" NOT NULL,
    "rank" INTEGER,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "month" INTEGER,
    "isPeriod" BOOLEAN NOT NULL DEFAULT false,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "youtubeQuery" TEXT NOT NULL DEFAULT '',
    "eraColor" TEXT NOT NULL DEFAULT '2020s',
    "confidence" "Confidence" NOT NULL DEFAULT 'APPROX',

    CONSTRAINT "ChartSong_pkey" PRIMARY KEY ("id")
);
