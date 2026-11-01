-- My Life 개편 2단계 — 채팅 → 노드 제안. docs/phase/my-life-restructure.md §3.4·§3.5·§3.8, 결정 Q62·Q63·Q67.
--
-- 추가만: 새 테이블 2개 + 기존 InterviewItem 에 nullable 칸 1개.
--   ChatV3Segment — /chat-v3 자유 대화 "지금 구간"(사용자당 1행): 구간 시작 시각 · 주제 힌트 ·
--                   아직 결정 안 한 제안 카드 · 방금 만든 노드 제목 최대 2개.
--                   채팅 로그(OnboardingChatMessage)는 role 이 user/assistant 뿐이라 경계·카드를 못 담는다.
--   ChatV3Usage   — 자유 대화 응답·제안 호출 원가 원장(도그푸딩 무료 + 원가 기록 — Q63) + 전역 하루 예산 가드.
--                   대화 내용 없음(모델·토큰·원가만). 탈퇴 시 userId 만 비움(LabUsage 와 같음).
--   InterviewItem.proposal — 오늘의 인터뷰 이야기형 문항 마무리 카드(Q67). 새로고침에도 카드 유지.
-- "User"·"LifeEvent"·"Person" 은 새 FK 의 참조 대상일 뿐(그 테이블 DDL 0).
--
-- migrate diff(--from-config-datasource)가 함께 낸 알려진 drift 5문장은 의도적으로 제외:
--   UserMemory_parentMemoryId_fkey DROP + 재생성(ON UPDATE CASCADE) /
--   DROP INDEX Person_userId_isDraft_idx / DROP INDEX UserMemory_userId_isDraft_idx /
--   CompanionSession.audioPaths DROP DEFAULT
-- 아래 본문 = migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma 결과 그대로.

-- AlterTable
ALTER TABLE "InterviewItem" ADD COLUMN     "proposal" JSONB;

-- CreateTable
CREATE TABLE "ChatV3Segment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topicEventId" TEXT,
    "topicPersonId" TEXT,
    "topicGapType" TEXT,
    "proposal" JSONB,
    "recentTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatV3Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatV3Usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatV3Usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatV3Segment_userId_key" ON "ChatV3Segment"("userId");

-- CreateIndex
CREATE INDEX "ChatV3Usage_createdAt_idx" ON "ChatV3Usage"("createdAt");

-- AddForeignKey
ALTER TABLE "ChatV3Segment" ADD CONSTRAINT "ChatV3Segment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatV3Segment" ADD CONSTRAINT "ChatV3Segment_topicEventId_fkey" FOREIGN KEY ("topicEventId") REFERENCES "LifeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatV3Segment" ADD CONSTRAINT "ChatV3Segment_topicPersonId_fkey" FOREIGN KEY ("topicPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatV3Usage" ADD CONSTRAINT "ChatV3Usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
