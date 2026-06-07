-- 기간 카테고리(학령기 5종 + MILITARY + WORK) 의 "끝 월" 입력 지원.
-- endYear 가 있을 때만 의미가 있고, 시간축의 "끝" 점이 EXACT 큰 점 + 월 라벨로 보인다.
-- 기존 행 전부 NULL — 무영향.
ALTER TABLE "UserMemory" ADD COLUMN "endMonth" INTEGER;
