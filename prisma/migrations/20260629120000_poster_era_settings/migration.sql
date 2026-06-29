-- 기능2c — 포스터 시대 대사건 설정. eraTier(0/1/2/3, 기본1)·removedEraEvents(뺀 id).
ALTER TABLE "Poster" ADD COLUMN "eraTier" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Poster" ADD COLUMN "removedEraEvents" TEXT[] NOT NULL DEFAULT '{}';
