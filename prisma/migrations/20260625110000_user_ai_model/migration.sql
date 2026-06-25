-- 전역 AI 모델 선택(라이브 응답). 기본 haiku = 현행 라이브 기본(기존 사용자 무영향).
ALTER TABLE "User" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'haiku';
