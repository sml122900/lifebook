-- 프롬프트 캐싱 원가 기록(2026-11-03 — docs/phase/my-life-restructure.md §17). 추가만(기존 행 0 으로 채움).
--
-- ChatV3Usage 에 캐시 쓰기·읽기 토큰 칸. inputTokens 는 지금처럼 입력 전체(캐시 포함), costMicroUsd 는 이미 캐시 배율
-- (쓰기 1.25배·읽기 0.1배)로 계산 중(코드 — 칸 없이도 원가는 맞음). 이 칸은 캐시 적중률을 원장에서 바로 보려는 것.

-- AlterTable
ALTER TABLE "ChatV3Usage" ADD COLUMN     "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0;
