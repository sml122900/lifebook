-- Phase companion: Step 4
-- CompanionSession 신규 + UserMemory/Person 에 isDraft + companionSessionId 추가
--
-- ADD COLUMN 만 — DROP/ALTER TYPE 없음. 기존 행 무영향.
-- 실행: npx prisma migrate deploy  (운영 DB 에 connect 된 상태)
-- 이후:  npx prisma generate       (클라이언트 재생성)

-- CreateTable: CompanionSession
CREATE TABLE "CompanionSession" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "audioPaths"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanionSession_pkey" PRIMARY KEY ("id")
);

-- AlterTable: UserMemory — isDraft(draft 검토 대기) + companionSessionId(FK)
ALTER TABLE "UserMemory" ADD COLUMN "isDraft"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserMemory" ADD COLUMN "companionSessionId" TEXT;

-- AlterTable: Person — isDraft(draft 검토 대기) + companionSessionId(FK)
ALTER TABLE "Person"     ADD COLUMN "isDraft"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Person"     ADD COLUMN "companionSessionId" TEXT;

-- CreateIndex
CREATE INDEX "CompanionSession_userId_createdAt_idx" ON "CompanionSession"("userId", "createdAt");
-- draft 전용 인덱스 (검토 화면 쿼리 최적화)
CREATE INDEX "UserMemory_userId_isDraft_idx" ON "UserMemory"("userId", "isDraft");
CREATE INDEX "Person_userId_isDraft_idx"     ON "Person"("userId", "isDraft");

-- AddForeignKey: CompanionSession → User
ALTER TABLE "CompanionSession"
    ADD CONSTRAINT "CompanionSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserMemory → CompanionSession (SetNull: 세션 삭제 시 링크만 제거)
ALTER TABLE "UserMemory"
    ADD CONSTRAINT "UserMemory_companionSessionId_fkey"
    FOREIGN KEY ("companionSessionId") REFERENCES "CompanionSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Person → CompanionSession
ALTER TABLE "Person"
    ADD CONSTRAINT "Person_companionSessionId_fkey"
    FOREIGN KEY ("companionSessionId") REFERENCES "CompanionSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
