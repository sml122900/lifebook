-- Phase 7b+: 동의 버전 관리 컬럼. 기존 사용자는 레거시(1)로 시작.
-- 음성 저장 수집 항목 변경(버전 2)에 재동의하면 2로 올라가 게이트 통과.
-- AddColumn
ALTER TABLE "User" ADD COLUMN "privacyConsentVersion" INTEGER NOT NULL DEFAULT 1;
