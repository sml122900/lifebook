-- AI 지도 편집 기록(custom-graph Q92 B안 — 2026-11-07 성민 승인). 추가만 — 기존 테이블·행 무변. 도구 실행 1번 = 1행, 문장·이름·본문 칸 없음.
-- 90일 보관은 코드(lib/map-edit-log — 쓸 때 지난 행 삭제), 탈퇴는 userId FK Cascade. nodeId 는 다형이라 FK 없음.
-- 생성: prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script(드리프트 0 확인 뒤).

-- CreateTable
CREATE TABLE "MapEditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "MapEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapEditLog_userId_createdAt_idx" ON "MapEditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MapEditLog_commandId_idx" ON "MapEditLog"("commandId");

-- AddForeignKey
ALTER TABLE "MapEditLog" ADD CONSTRAINT "MapEditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

