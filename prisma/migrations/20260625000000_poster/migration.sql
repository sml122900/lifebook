-- P2 — Poster 작업본 테이블. 유저당 1개(userId UNIQUE). cascade delete.
-- selections Json = 사용자가 확정한 선택 [{eventId, type, order}]. template/design
-- 은 P5 디자인 자리(지금은 null). 기존 데이터 무영향(신규 테이블).

-- CreateTable
CREATE TABLE "Poster" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selections" JSONB NOT NULL DEFAULT '[]',
    "template" TEXT,
    "design" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Poster_userId_key" ON "Poster"("userId");

-- AddForeignKey
ALTER TABLE "Poster" ADD CONSTRAINT "Poster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
