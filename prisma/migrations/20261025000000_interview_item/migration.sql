-- 오늘의 인터뷰 1차 — 신규 테이블 1개(InterviewItem: 문항 기록 + 문항별 AI 사용량).
-- docs/phase/today-interview.md §6.2 T안 (Q1 결정: 채팅 로그 테이블 혼용 안 함).
--
-- 순수 ADD: 기존 테이블 DDL 0. "User" 는 신규 테이블 FK 의 참조 대상일 뿐
-- (User 테이블 자체에 대한 ALTER/INDEX 없음 — schema.prisma 의 User 쪽은 관계 필드 1줄만).
--
-- migrate diff(--from-config-datasource)가 함께 낸 알려진 drift 5문장은 의도적으로 제외:
--   UserMemory_parentMemoryId_fkey DROP + 재생성(ON UPDATE CASCADE) /
--   DROP INDEX Person_userId_isDraft_idx / DROP INDEX UserMemory_userId_isDraft_idx /
--   CompanionSession.audioPaths DROP DEFAULT
-- 아래 본문 = migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma 결과 그대로.

-- CreateTable
CREATE TABLE "InterviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "askedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "turns" INTEGER NOT NULL DEFAULT 0,
    "answerChars" INTEGER NOT NULL DEFAULT 0,
    "refId" TEXT,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewItem_userId_itemKey_idx" ON "InterviewItem"("userId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewItem_userId_day_ordinal_key" ON "InterviewItem"("userId", "day", "ordinal");

-- AddForeignKey
ALTER TABLE "InterviewItem" ADD CONSTRAINT "InterviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

