-- v3 P6 — 인물 모드. 뼈대(LifeEvent) ↔ 인물(Person) 다대다 조인 테이블
-- 신설(PersonEvent 와 동일 패턴, 대상만 UserMemory 대신 LifeEvent) + Episode
-- 에 personId 컬럼 추가(그 인물과의 이야기 태깅, SetNull — 인물 삭제 시
-- 이야기 본문은 보존).
--
-- 순수 추가만 — 컬럼/테이블 삭제, 데이터 변경 없음. 위험 없음.
--
-- (`prisma migrate diff` 로 뽑으면 이 변경과 무관한 기존 drift 4건도 함께
-- 나오는데 — UserMemory_parentMemoryId_fkey 재생성·Person/UserMemory 의
-- isDraft 인덱스 drop·CompanionSession.audioPaths DROP DEFAULT — 전부 이번
-- 스키마 변경 이전부터 있던 항목이라 여기 포함하지 않는다.)

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "PersonLifeEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "lifeEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonLifeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonLifeEvent_userId_idx" ON "PersonLifeEvent"("userId");

-- CreateIndex
CREATE INDEX "PersonLifeEvent_lifeEventId_idx" ON "PersonLifeEvent"("lifeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLifeEvent_personId_lifeEventId_key" ON "PersonLifeEvent"("personId", "lifeEventId");

-- CreateIndex
CREATE INDEX "Episode_personId_idx" ON "Episode"("personId");

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLifeEvent" ADD CONSTRAINT "PersonLifeEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLifeEvent" ADD CONSTRAINT "PersonLifeEvent_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES "LifeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
