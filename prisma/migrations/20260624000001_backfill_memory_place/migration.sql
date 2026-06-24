-- 백필 — 기존 UserMemory 의 평면 장소(placeName 있는 행) → MemoryPlace 1건씩.
--
-- 멱등(재실행 안전): 해당 메모리에 MemoryPlace 가 이미 하나라도 있으면 건너뛴다
-- (NOT EXISTS 가드). 따라서 이 마이그를 다시 돌려도 중복 생성되지 않는다.
--
-- 평면 5컬럼은 삭제하지 않으므로, 이 백필 후에도 두 표현이 공존한다(이번 단계는
-- 추가만 — 읽기/쓰기 코드 전환은 후속).
--
-- id 는 gen_random_uuid()::text (Postgres 13+ 코어 함수). sortOrder=0(단일 장소).

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
