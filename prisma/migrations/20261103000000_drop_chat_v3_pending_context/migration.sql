-- 2026-11-03 — ChatV3PendingContext 제거 [승인 대기 — 성민. 적용·커밋 전].
-- 옛 /chat-v3 "대기 대화"(개편 전 이야기·인물 단계 이어하기, 2026-09-02). My Life 개편 2단계(2026-11-01) 뒤로 앱은
-- 행을 만들지 않고, 읽는 곳은 lib/free-chat.ts adoptLegacyPending(자유 대화 주제로 이어받고 지움) 하나.
-- 남은 4행(V2 @test.com 테스트 계정 test7·12·18·20, 2026-09)은 2026-11-03 삭제 → 0행.
-- 승인되면 같은 커밋에서: schema.prisma 모델·enum·relation 3곳 삭제 · adoptLegacyPending 과 호출부 삭제 ·
-- 회귀 test-p18-1·test-chat-proposal 의 이어받기 검사 삭제 · db/check-test30.ts 대기 대화 조회 삭제.
-- SQL = prisma migrate diff(지금 스키마 → 모델·enum·relation 뺀 스키마) 그대로.

-- DropForeignKey
ALTER TABLE "ChatV3PendingContext" DROP CONSTRAINT "ChatV3PendingContext_userId_fkey";

-- DropForeignKey
ALTER TABLE "ChatV3PendingContext" DROP CONSTRAINT "ChatV3PendingContext_targetEventId_fkey";

-- DropForeignKey
ALTER TABLE "ChatV3PendingContext" DROP CONSTRAINT "ChatV3PendingContext_targetPersonId_fkey";

-- DropTable
DROP TABLE "ChatV3PendingContext";

-- DropEnum
DROP TYPE "ChatV3PendingStage";

