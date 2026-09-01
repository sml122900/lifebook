-- 회원 탈퇴 버그 픽스 — LifeEvent/OnboardingProfile 에 onDelete:Cascade 가
-- 없어 tx.user.delete() 가 "Foreign key constraint violated on
-- LifeEvent_userId_fkey" 로 실패하던 문제(v3 P1~P4 에서 두 모델을 추가할 때
-- 기존 Poster/CompanionSession/OnboardingChatMessage 와 다른 패턴으로 빠뜨림).
-- Episode.lifeEvent 도 같은 이유로 Cascade 추가 — LifeEvent 가 User cascade로
-- 지워질 때 Episode 가 고아로 남아 같은 FK 위반을 재발시키는 것을 막는다
-- (Episode.memory 는 이미 Cascade 라 UserMemory 경로는 기존에도 안전했음).
--
-- FK DROP + 같은 이름으로 재생성(ON DELETE CASCADE 추가)만 — 컬럼/테이블
-- 변경 없음, 데이터 손실 없음. 순수 제약조건 강화.

-- DropForeignKey
ALTER TABLE "LifeEvent" DROP CONSTRAINT "LifeEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingProfile" DROP CONSTRAINT "OnboardingProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "Episode" DROP CONSTRAINT "Episode_lifeEventId_fkey";

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES "LifeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
