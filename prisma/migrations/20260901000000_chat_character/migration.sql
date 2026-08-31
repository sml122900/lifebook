-- v3 P5 — /chat-v3 대화 캐릭터 선택 + 애니메이션 끄기 토글.
-- 기본 duri(placeholder) + 애니메이션 기본 켜짐(기존 사용자 무영향).
ALTER TABLE "User" ADD COLUMN "characterId" TEXT NOT NULL DEFAULT 'duri';
ALTER TABLE "User" ADD COLUMN "characterMotionEnabled" BOOLEAN NOT NULL DEFAULT true;
