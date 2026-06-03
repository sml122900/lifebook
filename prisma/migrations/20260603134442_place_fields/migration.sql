-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "placeAddress" TEXT,
ADD COLUMN     "placeName" TEXT,
ADD COLUMN     "placeSource" TEXT;
