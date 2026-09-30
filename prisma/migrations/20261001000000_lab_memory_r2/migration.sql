-- 기억 에이전트 연구 트랙 R2 — 신규 테이블 1개(LabAgentRun: 질의응답 에이전트 실행 기록).
-- phase/기억에이전트_R1-R4_기획.md R2-1.
--
-- 순수 ADD: 기존 테이블 DDL 0. "User" 는 신규 테이블 FK 의 참조 대상일 뿐
-- (User 테이블 자체에 대한 ALTER/INDEX 없음 — schema.prisma 의 User 쪽은 관계 필드 1줄만).
--
-- migrate diff(--from-config-datasource)가 함께 낸 알려진 drift 5문장은 의도적으로 제외:
--   UserMemory_parentMemoryId_fkey DROP + 재생성(ON UPDATE CASCADE) /
--   DROP INDEX Person_userId_isDraft_idx / DROP INDEX UserMemory_userId_isDraft_idx /
--   CompanionSession.audioPaths DROP DEFAULT

-- CreateTable
CREATE TABLE "LabAgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT,
    "question" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "citedCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "droppedClaims" INTEGER NOT NULL DEFAULT 0,
    "toolTrace" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabAgentRun_userId_createdAt_idx" ON "LabAgentRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LabAgentRun_refId_idx" ON "LabAgentRun"("refId");

-- AddForeignKey
ALTER TABLE "LabAgentRun" ADD CONSTRAINT "LabAgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
