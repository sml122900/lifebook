-- 테스트 계정 명시 표시(2026-11-08 — 성민 지시: 이메일 끝 .test 만으로 판단하지 말고 명시 목록·DB 표시도). 추가만 — 기존 행은 false.
-- 운영 하루 예산(lib/chat-v3-usage spentTodayMicroUsd)이 이 표시가 켜진 계정의 사용분을 뺀다. 표시는 db/mark-test-accounts.ts.
-- 생성: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script(드리프트 0 확인 뒤).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
