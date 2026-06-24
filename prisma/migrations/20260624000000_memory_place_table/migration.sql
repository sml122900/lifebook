-- 장소 1:N — MemoryPlace 테이블 추가.
-- UserMemory 1:N MemoryPlace. cascade delete (UserMemory 삭제 → MemoryPlace 정리).
-- 기존 UserMemory 의 평면 장소 5컬럼(placeName/placeAddress/lat/lng/placeSource)은
-- 호환·롤백 위해 그대로 유지한다. 데이터 이전은 다음 마이그(백필).

-- CreateTable
CREATE TABLE "MemoryPlace" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "placeAddress" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "placeSource" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryPlace_memoryId_idx" ON "MemoryPlace"("memoryId");

-- AddForeignKey
ALTER TABLE "MemoryPlace" ADD CONSTRAINT "MemoryPlace_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "UserMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
