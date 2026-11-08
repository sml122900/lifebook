-- 강물 포스터 판매 종료 뒷정리(2026-11-09 성민 승인 — docs/phase/print-mylife.md §13.3). 데이터는 테스트 계정 것뿐(Poster 8행 · extractedPreferences 값 있는 계정 0).
-- 보존 주문 2건의 행·posterSnapshot(ProductOrder)·Storage 그림(photos/poster-orders/)은 그대로. User.userPreferences 는 기억 연구실(lib/lab)이 써서 남김.
-- 생성: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script(적용 전 드리프트 0 확인 뒤).

-- DropForeignKey
ALTER TABLE "Poster" DROP CONSTRAINT "Poster_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "extractedPreferences";

-- DropTable
DROP TABLE "Poster";

