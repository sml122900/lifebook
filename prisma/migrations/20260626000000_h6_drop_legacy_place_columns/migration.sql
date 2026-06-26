-- H6 — UserMemory 의 옛 평면 장소 5컬럼 제거. 장소는 이제 MemoryPlace 가 단일
-- 출처(H1~H5 에서 1:N 전환 완료, 코드가 MemoryPlace 만 read/write).
--
-- 안전장치: 컬럼을 떨구기 전에 백필을 한 번 더 멱등 실행한다. 20260624000001
-- 백필 이후 dual-write 로 모든 신규 장소가 MemoryPlace 에도 들어갔지만, 혹시
-- placeName 만 있고 MemoryPlace 행이 없는 잔여 행이 있다면 여기서 옮겨 담아
-- 데이터 손실 0 을 보장한다(NOT EXISTS 가드 → 중복 생성 없음).
INSERT INTO "MemoryPlace" ("id", "memoryId", "placeName", "placeAddress", "lat", "lng", "placeSource", "sortOrder", "createdAt")
SELECT
    gen_random_uuid()::text,
    m."id",
    m."placeName",
    m."placeAddress",
    m."lat",
    m."lng",
    m."placeSource",
    0,
    CURRENT_TIMESTAMP
FROM "UserMemory" m
WHERE m."placeName" IS NOT NULL
  AND btrim(m."placeName") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "MemoryPlace" p WHERE p."memoryId" = m."id"
  );

-- 옛 평면 5컬럼 제거.
ALTER TABLE "UserMemory" DROP COLUMN "placeName";
ALTER TABLE "UserMemory" DROP COLUMN "placeAddress";
ALTER TABLE "UserMemory" DROP COLUMN "lat";
ALTER TABLE "UserMemory" DROP COLUMN "lng";
ALTER TABLE "UserMemory" DROP COLUMN "placeSource";
