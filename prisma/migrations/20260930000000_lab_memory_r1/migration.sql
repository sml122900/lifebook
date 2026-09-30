-- 기억 에이전트 연구 트랙 R1 — 신규 테이블 3개(MemorySourceUnit·MemoryCard·LabUsage).
-- phase/기억에이전트_R1-R4_기획.md §2-1.
--
-- 순수 ADD: 기존 테이블 DDL 0. "User" 는 신규 테이블 FK 의 참조 대상일 뿐
-- (User 테이블 자체에 대한 ALTER/INDEX 없음 — schema.prisma 의 User 쪽은 관계 필드만).
--
-- migrate diff(--from-config-datasource)가 함께 낸 알려진 drift 5문장은 의도적으로 제외:
--   UserMemory_parentMemoryId_fkey DROP + 재생성(ON UPDATE CASCADE) /
--   DROP INDEX Person_userId_isDraft_idx / DROP INDEX UserMemory_userId_isDraft_idx /
--   CompanionSession.audioPaths DROP DEFAULT
-- (특히 isDraft 인덱스 삭제는 초안 검토 화면 성능 회귀 — 별도 작업 전까지 무접촉)

-- CreateTable
CREATE TABLE "MemorySourceUnit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "contextHash" TEXT,
    "status" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemorySourceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "quote" TEXT,
    "quoteField" TEXT,
    "quoteStart" INTEGER,
    "quoteEnd" INTEGER,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "month" INTEGER,
    "timePrecision" TEXT NOT NULL,
    "timeBasis" TEXT NOT NULL,
    "timeExpression" TEXT,
    "lifeStage" TEXT,
    "personIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personMentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placeNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sessionKey" TEXT NOT NULL,
    "embedding" vector(1024),
    "embeddingModel" TEXT,
    "extractorModel" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemorySourceUnit_userId_sourceType_sourceId_key" ON "MemorySourceUnit"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "MemoryCard_userId_yearFrom_idx" ON "MemoryCard"("userId", "yearFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryCard_unitId_ordinal_key" ON "MemoryCard"("unitId", "ordinal");

-- CreateIndex
CREATE INDEX "LabUsage_createdAt_idx" ON "LabUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "MemorySourceUnit" ADD CONSTRAINT "MemorySourceUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCard" ADD CONSTRAINT "MemoryCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCard" ADD CONSTRAINT "MemoryCard_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "MemorySourceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabUsage" ADD CONSTRAINT "LabUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
