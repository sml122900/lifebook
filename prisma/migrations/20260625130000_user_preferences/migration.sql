-- P5-5a — 맞춤배경 취향 저장(출처 분리). 기존 행 빈 배열.
ALTER TABLE "User" ADD COLUMN "extractedPreferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "userPreferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
