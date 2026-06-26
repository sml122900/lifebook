-- 코치마크 온보딩 둘러보기 — 완료/건너뛴 투어 id 목록.
-- 기존 사용자 = '{}' (첫 진입 시 1회 자동 표시). 새 화면 투어는 id 만 추가.
ALTER TABLE "User" ADD COLUMN "completedTours" TEXT[] NOT NULL DEFAULT '{}';
