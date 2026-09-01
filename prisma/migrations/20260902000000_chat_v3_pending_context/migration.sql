-- P7-7 — /chat-v3 재진입 시 episode/person 단계에서 어떤 이벤트·인물을
-- 다루던 중이었는지 복원하기 위한 싱글턴 상태 테이블(FamilyFeedSeen 과
-- 같은 패턴, 사용자당 1행 — userId 가 유일 결정자). confirm/profile 단계는
-- 기존처럼 LifeEvent/OnboardingProfile 실제 상태에서 재계산하므로 이
-- 테이블이 필요 없다 — episode/person 만 DB에 재계산할 근거가 없어 별도로
-- 기억한다.
--
-- targetEventId/targetPersonId 는 unique 를 걸지 않는다 — "사용자당 1행"
-- 은 userId @unique 만으로 충분하고, 이벤트/인물 쪽에 unique 를 거는 건
-- "테이블 전체에서 그 이벤트/인물이 유일"이라는 더 강한(불필요한) 제약이라
-- 뺐다. LifeEvent 쪽 역참조 필드도 어디서도 안 쓰여서 빼고 일반 FK 로만
-- 남겼다. targetPersonId 는 인물이 개별 삭제되면 SetNull(Episode.personId
-- 와 동일 패턴) — 재진입 시 "일반 사건 회고"로 안전하게 강등된다.
--
-- 순수 추가만 — 기존 테이블/컬럼 삭제, 데이터 변경 없음. 위험 없음.
--
-- (`prisma migrate diff` 로 뽑으면 이 변경과 무관한 기존 drift 4건도 함께
-- 나오는데 — UserMemory_parentMemoryId_fkey 재생성·Person/UserMemory 의
-- isDraft 인덱스 drop·CompanionSession.audioPaths DROP DEFAULT — 전부 이번
-- 스키마 변경 이전부터 있던 항목이라 여기 포함하지 않는다.)

-- CreateEnum
CREATE TYPE "ChatV3PendingStage" AS ENUM ('EPISODE', 'PERSON');

-- CreateTable
CREATE TABLE "ChatV3PendingContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" "ChatV3PendingStage" NOT NULL,
    "targetEventId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatV3PendingContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatV3PendingContext_userId_key" ON "ChatV3PendingContext"("userId");

-- AddForeignKey
ALTER TABLE "ChatV3PendingContext" ADD CONSTRAINT "ChatV3PendingContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatV3PendingContext" ADD CONSTRAINT "ChatV3PendingContext_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "LifeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatV3PendingContext" ADD CONSTRAINT "ChatV3PendingContext_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
