-- v3 인생 연혁 카테고리 개편 (2026-06-02)
--
-- 통합 테스트 후 1단계 개선:
--   - SCHOOL(통합) → ELEMENTARY/MIDDLE/HIGH/UNIVERSITY 로 쪼갬
--   - CHILDHOOD → KINDERGARTEN(어린이집·유치원) 재정의
--   - RESIDENCE(큰 이사) / OTHER(그 외) 삭제
--
-- 기존 데이터 마이그레이션 정책 (사용자 결정 2026-06-02):
--   - SCHOOL 행 → ELEMENTARY (사용자가 L4 manage 에서 다른 학령으로 옮길 수 있음)
--   - CHILDHOOD 행 → KINDERGARTEN
--   - RESIDENCE / OTHER 행 → 삭제 (의미 매핑 불가)
--
-- Postgres 는 enum 값 DROP 을 지원 X — enum 재생성 패턴으로 처리.
-- ALTER TYPE ADD VALUE 는 트랜잭션 안에서 못 쓰므로 새 enum 만들고 컬럼 타입 변환.

-- 1) 매핑 불가 행 삭제 (RESIDENCE / OTHER)
DELETE FROM "UserMemory"
WHERE category IN ('RESIDENCE', 'OTHER');

-- 2) User.skippedLifeCategories 에서 4종 모두 제거 (정리)
--    array_remove 는 한 번에 한 값만 처리. 4번 중첩.
UPDATE "User" SET "skippedLifeCategories" =
  array_remove(
    array_remove(
      array_remove(
        array_remove("skippedLifeCategories", 'RESIDENCE'),
        'OTHER'
      ),
      'CHILDHOOD'
    ),
    'SCHOOL'
  );

-- 3) 새 enum 생성
CREATE TYPE "LifeCategory_new" AS ENUM (
  'BIRTH',
  'KINDERGARTEN',
  'ELEMENTARY',
  'MIDDLE',
  'HIGH',
  'UNIVERSITY',
  'MILITARY',
  'WORK',
  'RELATIONSHIP',
  'FAMILY'
);

-- 4) UserMemory.category 컬럼 타입 변환 + 의미 매핑
--    (RESIDENCE/OTHER 는 1) 단계에서 이미 삭제됨)
ALTER TABLE "UserMemory"
  ALTER COLUMN category TYPE "LifeCategory_new"
  USING (
    CASE category::text
      WHEN 'CHILDHOOD' THEN 'KINDERGARTEN'
      WHEN 'SCHOOL'    THEN 'ELEMENTARY'
      ELSE category::text
    END
  )::"LifeCategory_new";

-- 5) User.skippedLifeCategories 배열 타입 변환
--    array 안의 각 원소를 새 enum 으로 변환. 2) 단계에서 이미 정리했으므로 매핑 불필요.
--    Postgres 는 ALTER COLUMN ... USING 에서 서브쿼리(unnest) 를 금지하므로 text[] 경유로 직접 캐스트.
ALTER TABLE "User"
  ALTER COLUMN "skippedLifeCategories" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "skippedLifeCategories" TYPE "LifeCategory_new"[]
  USING "skippedLifeCategories"::text[]::"LifeCategory_new"[];

ALTER TABLE "User"
  ALTER COLUMN "skippedLifeCategories" SET DEFAULT ARRAY[]::"LifeCategory_new"[];

-- 6) 옛 enum 제거, 새 enum 이름 변경
DROP TYPE "LifeCategory";
ALTER TYPE "LifeCategory_new" RENAME TO "LifeCategory";
