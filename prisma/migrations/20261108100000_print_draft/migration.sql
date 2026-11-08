-- My Life 인쇄본(2026-11-08 — docs/phase/print-mylife.md Q10·Q11, 성민 확정). 추가만 — 기존 행 무영향.
-- PrintDraft = 출력 편집 상태(사용자당 1행, 탈퇴 Cascade) · ProductOrder.printSnapshot = 주문 때 배치(발주 PDF 는 이것만 그림).
-- 생성: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script(드리프트 0 확인 뒤).

-- AlterTable
ALTER TABLE "ProductOrder" ADD COLUMN     "printSnapshot" JSONB;

-- CreateTable
CREATE TABLE "PrintDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showPeopleEdges" BOOLEAN NOT NULL DEFAULT true,
    "showPlaceEdges" BOOLEAN NOT NULL DEFAULT true,
    "initials" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintDraft_userId_key" ON "PrintDraft"("userId");

-- AddForeignKey
ALTER TABLE "PrintDraft" ADD CONSTRAINT "PrintDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

