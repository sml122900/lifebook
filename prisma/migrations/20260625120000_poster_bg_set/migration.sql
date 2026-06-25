-- P5-4 — 맞춤배경 세트 진행 카운트(현재 열린 세트의 생성 장 수). 기존 행 0.
ALTER TABLE "Poster" ADD COLUMN "bgSetCount" INTEGER NOT NULL DEFAULT 0;
