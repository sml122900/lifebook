-- v3 통합 채팅(P2) — /chat-v3 전체 대화 로그. 순수 ADD(신규 테이블만),
-- 기존 테이블 변경 0.
CREATE TABLE "OnboardingChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingChatMessage_userId_createdAt_idx" ON "OnboardingChatMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnboardingChatMessage" ADD CONSTRAINT "OnboardingChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
