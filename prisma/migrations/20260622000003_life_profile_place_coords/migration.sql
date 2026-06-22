-- AlterTable: onboarding 장소 좌표 저장 (PlaceInfo JSON 배열)
-- 소비처: 미구현 (나중 map/poster용)
ALTER TABLE "LifeProfile" ADD COLUMN "residencePlaces" JSONB;
ALTER TABLE "LifeProfile" ADD COLUMN "schoolPlaces" JSONB;
